import maplibregl from "maplibre-gl";

export interface Typography {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  letterSpacing?: number;
  lineHeight?: number | string;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  textAlign?: "left" | "center" | "right";
  maxWidth?: number;
}

export interface Pointer {
  overrideColor?: boolean;
  color?: string;
  width: number;
  height: number;
  attachEdge: "top" | "bottom" | "left" | "right";
  attachFrom: "left" | "right" | "top" | "bottom" | "center";
  attachOffset: number;
  tipX: number;
  tipY: number;
  independentColor?: boolean;
}

export interface PrimaryBackplate {
  overrideColor?: boolean;
  color?: string;
  height: number;
  capWidth: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  typography: Typography;
  pointer: Pointer;
  anchor?: "center" | "top" | "bottom" | "left" | "right";
}

export interface SecondaryBackplate {
  overrideColor?: boolean;
  color?: string;
  height: number;
  capWidth: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  typography: Typography;
  position: "above" | "below" | "left" | "right";
  align: "left" | "center" | "right" | "top" | "bottom";
  gap: number;
}

export interface TemplateManifest {
  name: string;
  kind: string[];
  primary: PrimaryBackplate;
  secondary?: SecondaryBackplate;
  fonts?: { family: string; file: string }[];
}

export interface Theme {
  primaryBackplateFill?: string;
  secondaryBackplateFill?: string;
  primaryTextColor?: string;
  secondaryTextColor?: string;
  pointerFill?: string;
  accentFill?: string;
}

export interface LabelHandle {
  id: string;
  setText(text: string | { primary: string; secondary?: string }): void;
  setTemplate(name: string): void;
  setTheme(theme: Partial<Theme>): void;
  remove(): void;
  getElement(): HTMLElement;
  getRasterizedImage(scale?: number): Promise<HTMLImageElement>;
  getLngLat(): [number, number];
}

interface LoadedTemplate {
  manifest: TemplateManifest;
  primaryLeftCap: string;
  primaryMiddleInner: string;
  primaryMiddleSrcWidth: number;
  primaryMiddleSrcHeight: number;
  primaryRightCap: string;
  primaryPointer: string;
  secondaryLeftCap?: string;
  secondaryMiddleInner?: string;
  secondaryMiddleSrcWidth?: number;
  secondaryMiddleSrcHeight?: number;
  secondaryRightCap?: string;
  fontCss?: string;
}

function extractSvgInner(svgString: string): string {
  const match = svgString.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  return match ? match[1] : svgString;
}

function parseMiddleSourceDimensions(svgString: string): {
  sourceWidth: number;
  sourceHeight: number;
} {
  let sourceWidth = 1,
    sourceHeight = 1;
  const viewBoxMatch = svgString.match(/viewBox="([^"]+)"/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/[ ,]+/).map(parseFloat);
    if (parts.length === 4) {
      sourceWidth = parts[2];
      sourceHeight = parts[3];
    }
  } else {
    const wMatch = svgString.match(/width="([^"]+)"/);
    const hMatch = svgString.match(/height="([^"]+)"/);
    if (wMatch) sourceWidth = parseFloat(wMatch[1]);
    if (hMatch) sourceHeight = parseFloat(hMatch[1]);
  }
  return { sourceWidth, sourceHeight };
}

function transformText(text: string, transform?: string): string {
  if (!text) return "";
  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}

function normalizeSvg(svgString: string, cssVarName: string | null): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return svgString;

  const styles = doc.querySelectorAll("style");
  const rules: Record<string, Record<string, string>> = {};

  styles.forEach((style) => {
    const text = style.textContent || "";
    const regex = /\.([a-zA-Z0-9_-]+)\s*{([^}]+)}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const className = match[1];
      const declarations = match[2];
      const props: Record<string, string> = {};
      declarations.split(";").forEach((decl) => {
        const [prop, val] = decl.split(":").map((s) => s.trim());
        if (prop && val) props[prop] = val;
      });
      rules[className] = props;
    }
  });

  const allEls = svg.querySelectorAll("*");
  allEls.forEach((el) => {
    if (el.hasAttribute("class")) {
      const classes = el.getAttribute("class")?.split(/\s+/) || [];
      classes.forEach((cls) => {
        if (rules[cls]) {
          ["fill", "stroke", "opacity", "stroke-width"].forEach((attr) => {
            if (rules[cls][attr] && !el.hasAttribute(attr)) {
              el.setAttribute(attr, rules[cls][attr]);
            }
          });
        }
      });
      el.removeAttribute("class");
    }

    let fillVal = el.getAttribute("fill");
    const elAny = el as any;
    if (elAny.style && elAny.style.fill) {
      fillVal = elAny.style.fill;
      elAny.style.removeProperty("fill");
    }
    if (fillVal && fillVal !== "none" && !fillVal.startsWith("url(")) {
      if (cssVarName) {
        el.setAttribute("fill", `var(${cssVarName}, ${fillVal})`);
      } else {
        el.setAttribute("fill", fillVal);
      }
    }
  });

  styles.forEach((style) => style.remove());
  doc.querySelectorAll("defs").forEach((def) => {
    if (def.children.length === 0) def.remove();
  });

  if (doc.querySelector("style")) {
    console.warn(
      "SVG still contains a <style> block after normalization. Rendering may be incorrect.",
    );
  }

  return svg.outerHTML;
}

export class LabelMarkerManager {
  private map: maplibregl.Map | null;
  public templates: Map<string, LoadedTemplate> = new Map();
  private handles: Map<string, LabelHandle> = new Map();
  private offscreenCanvas: HTMLCanvasElement | OffscreenCanvas;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor(map: maplibregl.Map | null = null) {
    this.map = map;
    if (typeof OffscreenCanvas !== "undefined") {
      this.offscreenCanvas = new OffscreenCanvas(1, 1);
      this.ctx = this.offscreenCanvas.getContext(
        "2d",
      ) as OffscreenCanvasRenderingContext2D;
    } else {
      this.offscreenCanvas = document.createElement("canvas");
      this.offscreenCanvas.width = 1;
      this.offscreenCanvas.height = 1;
      this.ctx = this.offscreenCanvas.getContext(
        "2d",
      ) as CanvasRenderingContext2D;
    }
  }

  async loadTemplates(names: string[]): Promise<void> {
    const promises = names.map(async (name) => {
      if (this.templates.has(name)) return;
      try {
        const base = `/label-templates/${name}`;
        const cb = `?t=${Date.now()}`;
        const manifestRes = await fetch(`${base}/manifest.json${cb}`);
        if (!manifestRes.ok) throw new Error(`Template not found: ${name}`);
        const contentType = manifestRes.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
          throw new Error(`Template ${name} manifest is missing or invalid (Server returned HTML instead of JSON). Make sure the folder and manifest.json exist.`);
        }
        const manifest: TemplateManifest = await manifestRes.json();

        // Validate
        // Legacy conversion
        if (typeof manifest.kind === "string") {
          if (manifest.kind === "both") manifest.kind = ["highlight", "regular"];
          else manifest.kind = [manifest.kind as string];
        }

        const hasRegularOrHeadline = manifest.kind.includes("regular") || manifest.kind.includes("headline");
        const hasPointer = manifest.kind.includes("regular") || manifest.kind.includes("highlight");

        if (manifest.kind.includes("highlight") && !manifest.kind.includes("regular") && !manifest.kind.includes("headline") && manifest.secondary)
          console.warn(
            `Template ${name} is highlight only but has secondary backplate`,
          );
        if (hasRegularOrHeadline && !manifest.secondary)
          throw new Error(
            `Template ${name} supports regular or headline but has no secondary`,
          );

        const required = [
          "primary_left-cap.svg",
          "primary_middle.svg",
          "primary_right-cap.svg",
        ];
        if (hasPointer) {
          required.push("primary_pointer.svg");
        }
        if (hasRegularOrHeadline) {
          required.push(
            "secondary_left-cap.svg",
            "secondary_middle.svg",
            "secondary_right-cap.svg",
          );
        }

        const fetches = await Promise.all(
          required.map((f) => {
            return fetch(`${base}/${f}${cb}`).then((r) => {
              if (!r.ok) throw new Error(`Missing required asset: ${f}`);
              return r.text();
            });
          }),
        );

        const normalizedFetches = fetches.map((svgString, idx) => {
          let cssVar: string | null = "--primary-backplate-fill";
          if (idx >= (hasPointer ? 4 : 3)) {
            cssVar = "--secondary-backplate-fill";
          } else if (hasPointer && idx === 3) {
            cssVar = "--pointer-fill";
          }
          return normalizeSvg(svgString, cssVar);
        });

        if (!hasPointer && !manifest.primary.pointer) {
          manifest.primary.pointer = { width: 0, height: 0, attachEdge: "bottom", attachFrom: "center", attachOffset: 0, tipX: 0, tipY: 0 };
        }

        const pmIdx = 1;
        const pmDim = parseMiddleSourceDimensions(normalizedFetches[pmIdx]);
        const template: LoadedTemplate = {
          manifest,
          primaryLeftCap: normalizedFetches[0],
          primaryMiddleInner: extractSvgInner(normalizedFetches[pmIdx]),
          primaryMiddleSrcWidth: pmDim.sourceWidth,
          primaryMiddleSrcHeight: pmDim.sourceHeight,
          primaryRightCap: normalizedFetches[2],
          primaryPointer: hasPointer ? normalizedFetches[3] : "",
        };

        if (hasRegularOrHeadline) {
          const sIdx = hasPointer ? 4 : 3;
          const smDim = parseMiddleSourceDimensions(normalizedFetches[sIdx + 1]);
          template.secondaryLeftCap = normalizedFetches[sIdx];
          template.secondaryMiddleInner = extractSvgInner(normalizedFetches[sIdx + 1]);
          template.secondaryMiddleSrcWidth = smDim.sourceWidth;
          template.secondaryMiddleSrcHeight = smDim.sourceHeight;
          template.secondaryRightCap = normalizedFetches[sIdx + 2];
        }

        let fontCss = "";
        if (manifest.fonts && manifest.fonts.length > 0) {
          const fontFetches = await Promise.all(
            manifest.fonts.map(async (font) => {
              const res = await fetch(`${base}/${font.file}${cb}`);
              if (!res.ok) throw new Error(`Missing font: ${font.file}`);
              const buffer = await res.arrayBuffer();
              const base64 = btoa(
                new Uint8Array(buffer).reduce(
                  (data, byte) => data + String.fromCharCode(byte),
                  ""
                )
              );
              const ext = font.file.split(".").pop()?.toLowerCase();
              const mime = ext === "otf" ? "font/otf" : "font/ttf";
              const format = ext === "otf" ? "opentype" : "truetype";
              const dataUrl = `data:${mime};base64,${base64}`;
              
              const css = `
                @font-face {
                  font-family: '${font.family}';
                  src: url('${dataUrl}') format('${format}');
                }
              `;
              
              const styleId = `template-font-${font.family.replace(/\s+/g, '-')}`;
              if (!document.getElementById(styleId)) {
                const styleEl = document.createElement('style');
                styleEl.id = styleId;
                styleEl.textContent = css;
                document.head.appendChild(styleEl);
              }
              
              return css;
            })
          );
          fontCss = fontFetches.join("\n");
        }

        template.fontCss = fontCss;

        this.templates.set(name, template);
      } catch (err) {
        console.error(`Error loading template ${name}:`, err);
      }
    });

    await Promise.all(promises);

    // Preload fonts
    const fontsToLoad = new Set<string>();
    this.templates.forEach((tpl) => {
      const { typography: pt } = tpl.manifest.primary;
      fontsToLoad.add(`${pt.fontWeight} ${pt.fontSize}px ${pt.fontFamily}`);
      if (tpl.manifest.secondary) {
        const { typography: st } = tpl.manifest.secondary;
        fontsToLoad.add(`${st.fontWeight} ${st.fontSize}px ${st.fontFamily}`);
      }
    });

    const fontPromises = Array.from(fontsToLoad).map((font) => {
      return document.fonts
        .load(font)
        .catch((e) => console.warn(`Failed to load font ${font}`, e));
    });
    await Promise.all(fontPromises);
  }

  private measureWithLetterSpacing(text: string, typo: Typography): number {
    this.ctx.font = `${typo.fontWeight} ${typo.fontSize}px ${typo.fontFamily}`;
    const transformed = transformText(text, typo.textTransform);
    let width = 0;

    if (typo.maxWidth && typo.maxWidth > 0) {
      const words = transformed.split(" ");
      let currentLine = "";
      let maxWidthFound = 0;

      for (let i = 0; i < words.length; i++) {
        const testLine = currentLine + words[i] + " ";
        const metrics = this.ctx.measureText(testLine);
        const ls = typo.letterSpacing || 0;
        const testWidth = metrics.width + ls * Math.max(0, testLine.length - 1);

        if (testWidth > typo.maxWidth && i > 0) {
          maxWidthFound = Math.max(
            maxWidthFound,
            this.ctx.measureText(currentLine).width +
              ls * Math.max(0, currentLine.length - 1),
          );
          currentLine = words[i] + " ";
        } else {
          currentLine = testLine;
        }
      }
      maxWidthFound = Math.max(
        maxWidthFound,
        this.ctx.measureText(currentLine.trim()).width +
          (typo.letterSpacing || 0) *
            Math.max(0, currentLine.trim().length - 1),
      );
      width = maxWidthFound;
    } else {
      const metrics = this.ctx.measureText(transformed);
      width =
        metrics.width +
        (typo.letterSpacing || 0) * Math.max(0, transformed.length - 1);
    }
    return Math.ceil(width);
  }

  createLabel(opts: {
    id: string;
    lngLat: [number, number];
    text: string | { primary: string; secondary?: string };
    template: string;
    theme?: Theme;
    hidePointer?: boolean;
    onClick?: (id: string) => void;
  }): LabelHandle {
    if (!this.templates.has(opts.template)) {
      throw new Error(`Template ${opts.template} not preloaded`);
    }

    if (!this.templates.has(opts.template)) {
      throw new Error(`Template ${opts.template} not found`);
    }
    const tpl = this.templates.get(opts.template)!;
    const man = tpl.manifest;

    const markerEl = document.createElement("div");
    markerEl.className = `label-marker label-marker-${opts.id}`;
    markerEl.dataset.template = opts.template;

    // Apply colors:
    // If overrideColor is true, use theme overrides. Otherwise, force the manifest default color.
    markerEl.style.setProperty(
      "--primary-backplate-fill",
      (man.primary.overrideColor && opts.theme?.primaryBackplateFill) ? opts.theme.primaryBackplateFill : (man.primary.color || "#ffffff"),
    );

    if (man.secondary) {
      markerEl.style.setProperty(
        "--secondary-backplate-fill",
        (man.secondary.overrideColor && opts.theme?.secondaryBackplateFill) ? opts.theme.secondaryBackplateFill : (man.secondary.color || "#ffffff"),
      );
    }

    if (man.primary.pointer) {
      markerEl.style.setProperty(
        "--pointer-fill",
        (man.primary.pointer.overrideColor && opts.theme?.pointerFill) ? opts.theme.pointerFill : (man.primary.pointer.color || "#ffffff"),
      );
    }

    markerEl.style.setProperty(
      "--primary-text-color",
      opts.theme?.primaryTextColor || man.primary.typography.color || "#000000",
    );
    if (man.secondary) {
      markerEl.style.setProperty(
        "--secondary-text-color",
        opts.theme?.secondaryTextColor ||
          man.secondary.typography.color ||
          "#ffffff",
      );
    }

    if (opts.theme?.accentFill)
      markerEl.style.setProperty("--accent-fill", opts.theme.accentFill);

    const handle: LabelHandle = {
      id: opts.id,
      setText: (text: string | { primary: string; secondary?: string }) => {
        opts.text = text;
        this.render(handle, opts.template, opts.text, opts.hidePointer, opts.onClick);
      },
      setTemplate: (name: string) => {
        if (!this.templates.has(name)) return;
        opts.template = name;
        markerEl.dataset.template = name;
        this.render(handle, opts.template, opts.text, opts.hidePointer, opts.onClick);
      },
      setTheme: (theme: Partial<Theme>) => {
        opts.theme = { ...opts.theme, ...theme };
        const currentTpl = this.templates.get(markerEl.dataset.template || "");
        const man = currentTpl?.manifest;
        if (man) {
          if (man.primary.overrideColor)
            markerEl.style.setProperty(
              "--primary-backplate-fill",
              theme.primaryBackplateFill || man.primary.color || "#ffffff"
            );
          if (man.secondary?.overrideColor)
            markerEl.style.setProperty(
              "--secondary-backplate-fill",
              theme.secondaryBackplateFill || man.secondary.color || "#ffffff"
            );
          if (man.primary.pointer?.overrideColor)
            markerEl.style.setProperty(
              "--pointer-fill",
              theme.pointerFill || man.primary.pointer.color || "#ffffff"
            );
          
          markerEl.style.setProperty(
            "--primary-text-color",
            theme.primaryTextColor || man.primary.typography.color || "#000000"
          );
          
          if (man.secondary) {
            markerEl.style.setProperty(
              "--secondary-text-color",
              theme.secondaryTextColor || man.secondary.typography.color || "#000000"
            );
          }
          
          if (theme.accentFill)
            markerEl.style.setProperty("--accent-fill", theme.accentFill);
        }
      },
      remove: () => {
        this.handles.delete(opts.id);
      },
      getElement: () => markerEl,
      getLngLat: () => opts.lngLat,
      getRasterizedImage: async (scale: number = 1) => {
        const tpl = this.templates.get(opts.template);
        if (!tpl) throw new Error("Template not found");

        const { svg: svgString } =
          LabelMarkerManager.prototype.buildTemplateSvg.call(
            this,
            tpl,
            opts.text,
            opts.theme,
            opts.hidePointer,
            scale
          );

        const url =
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
        const img = new Image();
        return new Promise<HTMLImageElement>((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject();
          img.src = url;
        });
      },
    };

    this.render(handle, opts.template, opts.text, opts.hidePointer, opts.onClick);
    this.handles.set(opts.id, handle);
    return handle;
  }

  private buildTemplateHtml(
    tpl: LoadedTemplate,
    textInput: string | { primary: string; secondary?: string },
    hidePointer?: boolean
  ): {
    html: string;
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
  } {
    const { manifest } = tpl;

    let primaryText = "";
    let secondaryText = "";
    if (typeof textInput === "string") {
      primaryText = textInput;
    } else {
      primaryText = textInput.primary;
      secondaryText = textInput.secondary || "";
    }

    if (!manifest.kind.includes("regular") && !manifest.kind.includes("headline") && secondaryText !== "") {
      throw new Error("Highlight templates cannot have secondary text");
    }

    const { primary, secondary } = manifest;

    // Primary
    const primaryTextWidth = this.measureWithLetterSpacing(
      primaryText,
      primary.typography,
    );
    const primaryWidth = Math.max(
      primary.minWidth,
      primaryTextWidth + 2 * primary.paddingX,
    );
    const primaryEffectiveCapWidth = Math.min(
      primary.capWidth,
      primaryWidth / 2,
    );
    const primaryMiddleStretched = Math.max(
      0,
      primaryWidth - 2 * primaryEffectiveCapWidth,
    );

    // Secondary
    let secondaryWidth = 0;
    let secondaryMiddleStretched = 0;
    let secondaryEffectiveCapWidth = 0;
    const secondaryVisible =
      (manifest.kind.includes("regular") || manifest.kind.includes("headline")) && secondaryText !== "";
    if (secondaryVisible && secondary) {
      const secondaryTextWidth = this.measureWithLetterSpacing(
        secondaryText,
        secondary.typography,
      );
      secondaryWidth = Math.max(
        secondary.minWidth,
        secondaryTextWidth + 2 * secondary.paddingX,
      );
      secondaryEffectiveCapWidth = Math.min(
        secondary.capWidth,
        secondaryWidth / 2,
      );
      secondaryMiddleStretched = Math.max(
        0,
        secondaryWidth - 2 * secondaryEffectiveCapWidth,
      );
    }

    let { pointer } = primary;
    if (hidePointer) {
      pointer = { ...pointer, width: 0, height: 0 };
    }
    const pointerOverhang = pointer.height;

    // Dimensions
    const gap = secondaryVisible && secondary ? secondary.gap : 0;
    const sPos = secondaryVisible && secondary ? secondary.position : null;
    const hasAbove = sPos === "above";
    const hasBelow = sPos === "below";
    const hasLeft = sPos === "left";
    const hasRight = sPos === "right";

    const pointerOverhangTop = pointer.attachEdge === "top" ? pointerOverhang : 0;
    const pointerOverhangBottom = pointer.attachEdge === "bottom" ? pointerOverhang : 0;
    const pointerOverhangLeft = pointer.attachEdge === "left" ? pointer.width : 0;
    const pointerOverhangRight = pointer.attachEdge === "right" ? pointer.width : 0;

    let secondaryAboveBlock = hasAbove ? secondary!.height + gap : 0;
    let secondaryBelowBlock = hasBelow ? secondary!.height + gap : 0;
    let secondaryLeftBlock = hasLeft ? secondaryWidth + gap : 0;
    let secondaryRightBlock = hasRight ? secondaryWidth + gap : 0;

    const initialMarkerWidth = Math.max(
      secondaryLeftBlock + pointerOverhangLeft + primaryWidth + pointerOverhangRight + secondaryRightBlock,
      hasAbove || hasBelow ? secondaryWidth : 0
    );

    const initialMarkerHeight = Math.max(
      secondaryAboveBlock + pointerOverhangTop + primary.height + pointerOverhangBottom + secondaryBelowBlock,
      hasLeft || hasRight ? secondary!.height : 0
    );

    // Initial offsets (might be negative if pointer tips overhang)
    let primaryTop = secondaryAboveBlock + pointerOverhangTop + (hasLeft || hasRight ? Math.max(0, (initialMarkerHeight - primary.height) / 2) : 0);
    let primaryLeft = hasLeft || hasRight ? secondaryLeftBlock + pointerOverhangLeft : (initialMarkerWidth - primaryWidth) / 2;

    let secondaryTop = 0;
    let secondaryLeft = 0;

    if (secondaryVisible && secondary) {
      if (hasAbove || hasBelow) {
        if (secondary.align === "left") secondaryLeft = primaryLeft;
        else if (secondary.align === "right") secondaryLeft = primaryLeft + primaryWidth - secondaryWidth;
        else secondaryLeft = primaryLeft + (primaryWidth - secondaryWidth) / 2;
        
        secondaryTop = hasAbove ? 0 : primaryTop + primary.height + pointerOverhangBottom + gap;
      } else {
        if (secondary.align === "top") secondaryTop = primaryTop;
        else if (secondary.align === "bottom") secondaryTop = primaryTop + primary.height - secondary.height;
        else secondaryTop = primaryTop + (primary.height - secondary.height) / 2;
        
        secondaryLeft = hasLeft ? primaryLeft - pointerOverhangLeft - gap - secondaryWidth : primaryLeft + primaryWidth + pointerOverhangRight + gap;
      }
    }

    // Now compute pointer position relative to primary
    let ptrLeft = 0;
    let ptrTop = 0;

    if (pointer.attachEdge === "bottom") {
      ptrTop = primaryTop + primary.height - 1;
      if (pointer.attachFrom === "left") ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "right") ptrLeft = primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "center") ptrLeft = primaryLeft + primaryWidth / 2 + pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === "top") {
      ptrTop = primaryTop - pointer.height + 1;
      if (pointer.attachFrom === "left") ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "right") ptrLeft = primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "center") ptrLeft = primaryLeft + primaryWidth / 2 + pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === "left") {
      ptrLeft = primaryLeft - pointer.width + 1;
      if (pointer.attachFrom === "top") ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "bottom") ptrTop = primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "center") ptrTop = primaryTop + primary.height / 2 + pointer.attachOffset - pointer.tipY;
    } else if (pointer.attachEdge === "right") {
      ptrLeft = primaryLeft + primaryWidth - 1;
      if (pointer.attachFrom === "top") ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "bottom") ptrTop = primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "center") ptrTop = primaryTop + primary.height / 2 + pointer.attachOffset - pointer.tipY;
    }

    // Shift everything if pointer tips go negative
    const minLeft = Math.min(primaryLeft, secondaryVisible ? secondaryLeft : 99999, ptrLeft);
    if (minLeft < 0) {
      primaryLeft -= minLeft;
      secondaryLeft -= minLeft;
      ptrLeft -= minLeft;
    }

    const minTop = Math.min(primaryTop, secondaryVisible ? secondaryTop : 99999, ptrTop);
    let shiftY = 0;
    if (minTop < 0) {
      shiftY = -minTop;
    }

    const finalPrimaryTop = primaryTop + shiftY;
    const finalSecondaryTop = secondaryTop + shiftY;
    const finalPtrTop = ptrTop + shiftY;

    const markerWidth = Math.ceil(
      Math.max(
        primaryLeft + primaryWidth,
        secondaryVisible ? secondaryLeft + secondaryWidth : 0,
        ptrLeft + pointer.width,
      ),
    );
    const finalMarkerHeight = Math.ceil(
      Math.max(
        finalPrimaryTop + primary.height,
        secondaryVisible ? finalSecondaryTop + secondary!.height : 0,
        finalPtrTop + pointer.height,
      ),
    );

    const buildTypographyCss = (typo: Typography, textColorVar?: string) => `
      font-family: '${typo.fontFamily}';
      font-size: ${typo.fontSize}px;
      font-weight: ${typo.fontWeight};
      color: ${textColorVar ? `var(${textColorVar}, ${typo.color})` : typo.color};
      letter-spacing: ${typo.letterSpacing || 0}px;
      line-height: ${typo.lineHeight || 1.2};
      text-transform: ${typo.textTransform || "none"};
      text-align: ${typo.textAlign || "center"};
    `;

    let html = "";

    // Primary
    html += `
      <div class="backplate primary" style="position: absolute; left: ${primaryLeft}px; top: ${finalPrimaryTop}px; width: ${primaryWidth}px; height: ${primary.height}px; display: flex; flex-direction: row; pointer-events: auto;">
        <div class="cap left" style="width: ${primaryEffectiveCapWidth}px; height: ${primary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none;">${tpl.primaryLeftCap}</div>
        ${primaryMiddleStretched > 0 ? `<svg class="middle" width="${primaryMiddleStretched}" height="${primary.height}" viewBox="0 0 ${tpl.primaryMiddleSrcWidth} ${tpl.primaryMiddleSrcHeight}" preserveAspectRatio="none" style="display: block; flex-shrink: 0; pointer-events: none;">${tpl.primaryMiddleInner}</svg>` : ""}
        <div class="cap right" style="width: ${primaryEffectiveCapWidth}px; height: ${primary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none; display: flex; justify-content: flex-end;">${tpl.primaryRightCap}</div>
        <span class="text" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; user-select: none; ${buildTypographyCss(primary.typography, "--primary-text-color")}">${transformText(primaryText, primary.typography.textTransform)}</span>
      </div>
    `;

    // Pointer
    if (pointer.width > 0) {
      html += `
        <div class="pointer" data-independent-color="${pointer.independentColor ? "true" : "false"}" style="position: absolute; left: ${ptrLeft}px; top: ${finalPtrTop}px; width: ${pointer.width}px; height: ${pointer.height}px; pointer-events: none;">
          ${tpl.primaryPointer}
        </div>
      `;
    }

    // Secondary
    if (secondaryVisible && secondary) {
      html += `
        <div class="backplate secondary" style="position: absolute; z-index: 2; left: ${secondaryLeft}px; top: ${finalSecondaryTop}px; width: ${secondaryWidth}px; height: ${secondary.height}px; display: flex; flex-direction: row; pointer-events: none;">
          <div class="cap left" style="width: ${secondaryEffectiveCapWidth}px; height: ${secondary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none;">${tpl.secondaryLeftCap}</div>
          ${secondaryMiddleStretched > 0 ? `<svg class="middle" width="${secondaryMiddleStretched}" height="${secondary.height}" viewBox="0 0 ${tpl.secondaryMiddleSrcWidth} ${tpl.secondaryMiddleSrcHeight}" preserveAspectRatio="none" style="display: block; flex-shrink: 0; pointer-events: none;">${tpl.secondaryMiddleInner}</svg>` : ""}
          <div class="cap right" style="width: ${secondaryEffectiveCapWidth}px; height: ${secondary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none; display: flex; justify-content: flex-end;">${tpl.secondaryRightCap}</div>
          <span class="text" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; user-select: none; ${buildTypographyCss(secondary.typography, "--secondary-text-color")}">${transformText(secondaryText, secondary.typography.textTransform)}</span>
        </div>
      `;
    }

    // Compute pointer tip mapbox offset.
    let anchorX = ptrLeft + pointer.tipX;
    let anchorY = finalPtrTop + pointer.tipY;

    if (pointer.width === 0 || hidePointer) {
      // No pointer (e.g. headline), fallback to primary anchor
      const pAnchor = primary.anchor || "center";
      if (pAnchor === "center") {
        anchorX = primaryLeft + primaryWidth / 2;
        anchorY = finalPrimaryTop + primary.height / 2;
      } else if (pAnchor === "bottom") {
        anchorX = primaryLeft + primaryWidth / 2;
        anchorY = finalPrimaryTop + primary.height;
      } else if (pAnchor === "top") {
        anchorX = primaryLeft + primaryWidth / 2;
        anchorY = finalPrimaryTop;
      } else if (pAnchor === "left") {
        anchorX = primaryLeft;
        anchorY = finalPrimaryTop + primary.height / 2;
      } else if (pAnchor === "right") {
        anchorX = primaryLeft + primaryWidth;
        anchorY = finalPrimaryTop + primary.height / 2;
      }
    }

    return {
      html,
      width: markerWidth,
      height: finalMarkerHeight,
      anchorX,
      anchorY,
    };
  }

  private buildTemplateSvg(
    tpl: LoadedTemplate,
    textInput: string | { primary: string; secondary?: string },
    theme: Theme | undefined,
    hidePointer?: boolean,
    scale: number = 1
  ): {
    svg: string;
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
  } {
    const { manifest } = tpl;

    let primaryText = "";
    let secondaryText = "";
    if (typeof textInput === "string") {
      primaryText = textInput;
    } else {
      primaryText = textInput.primary;
      secondaryText = textInput.secondary || "";
    }

    const { primary, secondary } = manifest;

    // Primary
    const primaryTextWidth = this.measureWithLetterSpacing(
      primaryText,
      primary.typography,
    );
    const primaryWidth = Math.max(
      primary.minWidth,
      primaryTextWidth + 2 * primary.paddingX,
    );
    const primaryEffectiveCapWidth = Math.min(
      primary.capWidth,
      primaryWidth / 2,
    );
    const primaryMiddleStretched = Math.max(
      0,
      primaryWidth - 2 * primaryEffectiveCapWidth,
    );

    // Secondary
    let secondaryWidth = 0;
    let secondaryMiddleStretched = 0;
    let secondaryEffectiveCapWidth = 0;
    const secondaryVisible =
      (manifest.kind.includes("regular") || manifest.kind.includes("headline")) && secondaryText !== "";
    if (secondaryVisible && secondary) {
      const secondaryTextWidth = this.measureWithLetterSpacing(
        secondaryText,
        secondary.typography,
      );
      secondaryWidth = Math.max(
        secondary.minWidth,
        secondaryTextWidth + 2 * secondary.paddingX,
      );
      secondaryEffectiveCapWidth = Math.min(
        secondary.capWidth,
        secondaryWidth / 2,
      );
      secondaryMiddleStretched = Math.max(
        0,
        secondaryWidth - 2 * secondaryEffectiveCapWidth,
      );
    }

    let { pointer } = primary;
    if (hidePointer) {
      pointer = { ...pointer, width: 0, height: 0 };
    }
    const pointerOverhang = pointer.height;

    // Dimensions
    const gap = secondaryVisible && secondary ? secondary.gap : 0;
    const hasAbove = secondaryVisible && secondary?.position === "above";
    const hasBelow = secondaryVisible && secondary?.position === "below";

    const heightAbove = hasAbove ? secondary!.height + gap : 0;

    let primaryLeft = 0;
    let secondaryLeft = 0;

    if (secondaryVisible && secondary) {
      if (secondary.align === "left") {
        primaryLeft = 0;
        secondaryLeft = 0;
      } else if (secondary.align === "right") {
        const maxW = Math.max(primaryWidth, secondaryWidth);
        primaryLeft = maxW - primaryWidth;
        secondaryLeft = maxW - secondaryWidth;
      } else {
        const maxW = Math.max(primaryWidth, secondaryWidth);
        primaryLeft = (maxW - primaryWidth) / 2;
        secondaryLeft = (maxW - secondaryWidth) / 2;
      }
    }

    const primaryTop = hasAbove
      ? heightAbove + (pointer.attachEdge === "top" ? pointerOverhang : 0)
      : pointer.attachEdge === "top"
        ? pointerOverhang
        : 0;

    let ptrLeft = 0;
    let ptrTop = 0;

    if (pointer.attachEdge === "bottom") {
      ptrTop = primaryTop + primary.height - 1;
      if (pointer.attachFrom === "left")
        ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "right")
        ptrLeft =
          primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "center")
        ptrLeft =
          primaryLeft + primaryWidth / 2 + pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === "top") {
      ptrTop = primaryTop - pointer.height + 1;
      if (pointer.attachFrom === "left")
        ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "right")
        ptrLeft =
          primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "center")
        ptrLeft =
          primaryLeft + primaryWidth / 2 + pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === "left") {
      ptrLeft = primaryLeft - pointer.width + 1;
      if (pointer.attachFrom === "top")
        ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "bottom")
        ptrTop =
          primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "center")
        ptrTop =
          primaryTop + primary.height / 2 + pointer.attachOffset - pointer.tipY;
    } else if (pointer.attachEdge === "right") {
      ptrLeft = primaryLeft + primaryWidth - 1;
      if (pointer.attachFrom === "top")
        ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "bottom")
        ptrTop =
          primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "center")
        ptrTop =
          primaryTop + primary.height / 2 + pointer.attachOffset - pointer.tipY;
    }

    const minLeft = Math.min(primaryLeft, secondaryLeft, ptrLeft);
    if (minLeft < 0) {
      primaryLeft -= minLeft;
      secondaryLeft -= minLeft;
      ptrLeft -= minLeft;
    }

    const minTop = Math.min(primaryTop, hasAbove ? 0 : 99999, ptrTop);
    let shiftY = 0;
    if (minTop < 0) shiftY = -minTop;

    const finalPrimaryTop = primaryTop + shiftY;
    const finalSecondaryTop = hasAbove
      ? shiftY
      : finalPrimaryTop +
        primary.height +
        (pointer.attachEdge === "bottom" ? pointerOverhang : 0) +
        gap;
    const finalPtrTop = ptrTop + shiftY;

    const markerWidth = Math.ceil(
      Math.max(
        primaryLeft + primaryWidth,
        secondaryVisible ? secondaryLeft + secondaryWidth : 0,
        ptrLeft + pointer.width,
      ),
    );
    const finalMarkerHeight = Math.ceil(
      Math.max(
        finalPrimaryTop + primary.height,
        secondaryVisible ? finalSecondaryTop + secondary!.height : 0,
        finalPtrTop + pointer.height,
      ),
    );

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${markerWidth * scale}" height="${finalMarkerHeight * scale}">`;
    if (tpl.fontCss) {
      svg += `<defs><style>${tpl.fontCss}</style></defs>`;
    }
    svg += `<g transform="scale(${scale})">`;

    svg += `
      <style>
        :root {
          --primary-backplate-fill: ${theme?.primaryBackplateFill || manifest?.primary?.color || "#ffffff"};
          --secondary-backplate-fill: ${theme?.secondaryBackplateFill || manifest?.secondary?.color || "#ffffff"};
          --pointer-fill: ${theme?.pointerFill || manifest?.primary?.pointer?.color || "#ffffff"};
          --primary-text-color: ${theme?.primaryTextColor || manifest?.primary?.typography?.color || "#000000"};
          --secondary-text-color: ${theme?.secondaryTextColor || manifest?.secondary?.typography?.color || "#000000"};
          --accent-fill: ${theme?.accentFill || "#000000"};
        }
      </style>
    `;

    // Secondary Above
    if (secondaryVisible && hasAbove && secondary) {
      svg += `
        <svg x="${secondaryLeft}" y="${finalSecondaryTop}" width="${secondaryWidth}" height="${secondary.height}">
          <svg x="0" y="0" width="${secondaryEffectiveCapWidth}" height="${secondary.height}" preserveAspectRatio="none">${tpl.secondaryLeftCap}</svg>
          ${secondaryMiddleStretched > 0 ? `<svg x="${secondaryEffectiveCapWidth}" y="0" width="${secondaryMiddleStretched}" height="${secondary.height}" viewBox="0 0 ${tpl.secondaryMiddleSrcWidth} ${tpl.secondaryMiddleSrcHeight}" preserveAspectRatio="none">${tpl.secondaryMiddleInner}</svg>` : ""}
          <svg x="${secondaryWidth - secondaryEffectiveCapWidth}" y="0" width="${secondaryEffectiveCapWidth}" height="${secondary.height}" preserveAspectRatio="none">${tpl.secondaryRightCap}</svg>
          <text x="50%" y="50%" font-family="${secondary.typography.fontFamily}" font-size="${secondary.typography.fontSize}px" font-weight="${secondary.typography.fontWeight}" fill="var(--secondary-text-color, ${secondary.typography.color})" text-anchor="middle" dominant-baseline="central" letter-spacing="${secondary.typography.letterSpacing || 0}">${transformText(secondaryText, secondary.typography.textTransform)}</text>
        </svg>
      `;
    }

    // Primary
    svg += `
      <svg x="${primaryLeft}" y="${finalPrimaryTop}" width="${primaryWidth}" height="${primary.height}">
        <svg x="0" y="0" width="${primaryEffectiveCapWidth}" height="${primary.height}" preserveAspectRatio="none">${tpl.primaryLeftCap}</svg>
        ${primaryMiddleStretched > 0 ? `<svg x="${primaryEffectiveCapWidth}" y="0" width="${primaryMiddleStretched}" height="${primary.height}" viewBox="0 0 ${tpl.primaryMiddleSrcWidth} ${tpl.primaryMiddleSrcHeight}" preserveAspectRatio="none">${tpl.primaryMiddleInner}</svg>` : ""}
        <svg x="${primaryWidth - primaryEffectiveCapWidth}" y="0" width="${primaryEffectiveCapWidth}" height="${primary.height}" preserveAspectRatio="none">${tpl.primaryRightCap}</svg>
        <text x="50%" y="50%" font-family="${primary.typography.fontFamily}" font-size="${primary.typography.fontSize}px" font-weight="${primary.typography.fontWeight}" fill="var(--primary-text-color, ${primary.typography.color})" text-anchor="middle" dominant-baseline="central" letter-spacing="${primary.typography.letterSpacing || 0}">${transformText(primaryText, primary.typography.textTransform)}</text>
      </svg>
    `;

    // Pointer
    if (pointer.width > 0) {
      svg += `
        <svg x="${ptrLeft}" y="${finalPtrTop}" width="${pointer.width}" height="${pointer.height}" preserveAspectRatio="none">
          ${tpl.primaryPointer}
        </svg>
      `;
    }

    // Secondary Below
    if (secondaryVisible && hasBelow && secondary) {
      svg += `
        <svg x="${secondaryLeft}" y="${finalSecondaryTop}" width="${secondaryWidth}" height="${secondary.height}">
          <svg x="0" y="0" width="${secondaryEffectiveCapWidth}" height="${secondary.height}" preserveAspectRatio="none">${tpl.secondaryLeftCap}</svg>
          ${secondaryMiddleStretched > 0 ? `<svg x="${secondaryEffectiveCapWidth}" y="0" width="${secondaryMiddleStretched}" height="${secondary.height}" viewBox="0 0 ${tpl.secondaryMiddleSrcWidth} ${tpl.secondaryMiddleSrcHeight}" preserveAspectRatio="none">${tpl.secondaryMiddleInner}</svg>` : ""}
          <svg x="${secondaryWidth - secondaryEffectiveCapWidth}" y="0" width="${secondaryEffectiveCapWidth}" height="${secondary.height}" preserveAspectRatio="none">${tpl.secondaryRightCap}</svg>
          <text x="50%" y="50%" font-family="${secondary.typography.fontFamily}" font-size="${secondary.typography.fontSize}px" font-weight="${secondary.typography.fontWeight}" fill="var(--secondary-text-color, ${secondary.typography.color})" text-anchor="middle" dominant-baseline="central" letter-spacing="${secondary.typography.letterSpacing || 0}">${transformText(secondaryText, secondary.typography.textTransform)}</text>
        </svg>
      `;
    }

    svg += "</g></svg>";

    // Canvas drawImage ignores CSS variables in data URIs, so we explicitly replace them with literal values
    svg = svg.replace(
      /var\(--primary-backplate-fill,\s*([^)]+)\)/g,
      theme?.primaryBackplateFill || manifest.primary.color || "$1",
    );
    svg = svg.replace(
      /var\(--secondary-backplate-fill,\s*([^)]+)\)/g,
      theme?.secondaryBackplateFill || manifest.secondary?.color || "$1",
    );
    svg = svg.replace(
      /var\(--pointer-fill,\s*([^)]+)\)/g,
      theme?.pointerFill || manifest.primary.pointer.color || "$1",
    );
    svg = svg.replace(
      /var\(--primary-text-color,\s*([^)]+)\)/g,
      theme?.primaryTextColor || manifest.primary.typography.color || "$1",
    );
    svg = svg.replace(
      /var\(--secondary-text-color,\s*([^)]+)\)/g,
      theme?.secondaryTextColor ||
        manifest.secondary?.typography?.color ||
        "$1",
    );
    svg = svg.replace(
      /var\(--accent-fill,\s*([^)]+)\)/g,
      theme?.accentFill || "$1",
    );

    return {
      svg,
      width: markerWidth * scale,
      height: finalMarkerHeight * scale,
      anchorX: ptrLeft + pointer.tipX,
      anchorY: finalPtrTop + pointer.tipY,
    };
  }

  getPreviewHtml(
    templateName: string,
    text: string | { primary: string; secondary?: string },
  ): string | null {
    const tpl = this.templates.get(templateName);
    if (!tpl) return null;
    const data = this.buildTemplateHtml(tpl, text);

    // Wrap in a relative container so the absolute positioning works in preview
    return `
      <div class="label-marker" style="position: relative; width: ${data.width}px; height: ${data.height}px; pointer-events: none;">
        ${data.html}
      </div>
    `;
  }

  private render(
    handle: LabelHandle,
    templateName: string,
    text: string | { primary: string; secondary?: string },
    hidePointer?: boolean,
    onClick?: (id: string) => void,
  ) {
    const tpl = this.templates.get(templateName);
    if (!tpl) return;
    const markerEl = handle.getElement();

    const data = this.buildTemplateHtml(tpl, text, hidePointer);

    markerEl.style.width = `${data.width}px`;
    markerEl.style.height = `${data.height}px`;
    markerEl.dataset.width = data.width.toString();
    markerEl.dataset.height = data.height.toString();
    markerEl.dataset.anchorX = data.anchorX.toString();
    markerEl.dataset.anchorY = data.anchorY.toString();

    markerEl.innerHTML = `
      <div class="annotation-scale-wrapper" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: ${data.anchorX}px ${data.anchorY}px;">
        ${data.html}
      </div>
    `;

    if (onClick) {
      const primaryBackplate = markerEl.querySelector(
        ".backplate.primary",
      ) as HTMLElement;
      if (primaryBackplate) {
        primaryBackplate.style.cursor = "pointer";
        primaryBackplate.addEventListener("click", (e) => {
          e.stopPropagation();
          onClick(handle.id);
        });
      }
    }

    const markerObj = (this.map as any)?._markers?.find(
      (m: any) => m.getElement() === markerEl,
    );
    if (markerObj) {
      markerObj.setOffset([-data.anchorX, -data.anchorY]);
    } else {
      markerEl.style.transform = `translate(${-data.anchorX}px, ${-data.anchorY}px)`;
    }
  }

  async getRasterizedImage(id: string, scale: number = 1): Promise<HTMLImageElement | null> {
    const handle = this.handles.get(id);
    if (!handle) return null;
    return handle.getRasterizedImage(scale);
  }

  getAnchorOffset(id: string): { x: number; y: number } | null {
    const handle = this.handles.get(id);
    if (!handle) return null;
    const el = handle.getElement();
    return {
      x: parseFloat(el.dataset.anchorX || "0"),
      y: parseFloat(el.dataset.anchorY || "0"),
    };
  }

  clear() {
    this.handles.clear();
  }
}

export const globalLabelManager = new LabelMarkerManager();
