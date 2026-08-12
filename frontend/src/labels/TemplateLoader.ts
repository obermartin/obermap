import type { LoadedTemplate, TemplateManifest } from "./types";
import { normalizeSvg, parseMiddleSourceDimensions, extractSvgInner } from "./utils/svgUtils";

export class TemplateLoader {
  public templates: Map<string, LoadedTemplate> = new Map();

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

  getTemplate(name: string): LoadedTemplate | undefined {
    return this.templates.get(name);
  }
}
