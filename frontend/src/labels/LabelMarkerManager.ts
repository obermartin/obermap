import maplibregl from 'maplibre-gl';

export interface Typography {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  letterSpacing?: number;
  lineHeight?: number | string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textAlign?: 'left' | 'center' | 'right';
  maxWidth?: number;
}

export interface Pointer {
  width: number;
  height: number;
  attachEdge: 'top' | 'bottom' | 'left' | 'right';
  attachFrom: 'left' | 'right' | 'top' | 'bottom';
  attachOffset: number;
  tipX: number;
  tipY: number;
  independentColor?: boolean;
}

export interface PrimaryBackplate {
  height: number;
  capWidth: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  typography: Typography;
  pointer: Pointer;
}

export interface SecondaryBackplate {
  height: number;
  capWidth: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  typography: Typography;
  position: 'above' | 'below';
  align: 'left' | 'center' | 'right';
  gap: number;
}

export interface TemplateManifest {
  name: string;
  kind: 'highlight' | 'regular';
  primary: PrimaryBackplate;
  secondary?: SecondaryBackplate;
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
  getRasterizedImage(): Promise<HTMLImageElement>;
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
}

function extractSvgInner(svgString: string): string {
  const match = svgString.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  return match ? match[1] : svgString;
}

function parseMiddleSourceDimensions(svgString: string): { sourceWidth: number, sourceHeight: number } {
  let sourceWidth = 1, sourceHeight = 1;
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
  if (!text) return '';
  switch (transform) {
    case 'uppercase': return text.toUpperCase();
    case 'lowercase': return text.toLowerCase();
    case 'capitalize': return text.replace(/\b\w/g, c => c.toUpperCase());
    default: return text;
  }
}

function normalizeSvg(svgString: string, cssVarName: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector('svg');
  if (!svg) return svgString;

  const styles = doc.querySelectorAll('style');
  const rules: Record<string, Record<string, string>> = {};

  styles.forEach(style => {
    const text = style.textContent || '';
    const regex = /\.([a-zA-Z0-9_-]+)\s*{([^}]+)}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const className = match[1];
      const declarations = match[2];
      const props: Record<string, string> = {};
      declarations.split(';').forEach(decl => {
        const [prop, val] = decl.split(':').map(s => s.trim());
        if (prop && val) props[prop] = val;
      });
      rules[className] = props;
    }
  });

  const allEls = svg.querySelectorAll('*');
  allEls.forEach(el => {
    if (el.hasAttribute('class')) {
      const classes = el.getAttribute('class')?.split(/\s+/) || [];
      classes.forEach(cls => {
        if (rules[cls]) {
          ['fill', 'stroke', 'opacity', 'stroke-width'].forEach(attr => {
            if (rules[cls][attr] && !el.hasAttribute(attr)) {
              el.setAttribute(attr, rules[cls][attr]);
            }
          });
        }
      });
      el.removeAttribute('class');
    }

    if (el.hasAttribute('fill')) {
      const fillVal = el.getAttribute('fill');
      if (fillVal && fillVal !== 'none' && !fillVal.startsWith('url(')) {
        el.setAttribute('fill', `var(${cssVarName}, ${fillVal})`);
      }
    }
  });

  styles.forEach(style => style.remove());
  doc.querySelectorAll('defs').forEach(def => {
    if (def.children.length === 0) def.remove();
  });

  if (doc.querySelector('style')) {
    console.warn('SVG still contains a <style> block after normalization. Rendering may be incorrect.');
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
    if (typeof OffscreenCanvas !== 'undefined') {
      this.offscreenCanvas = new OffscreenCanvas(1, 1);
      this.ctx = this.offscreenCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    } else {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = 1;
      this.offscreenCanvas.height = 1;
      this.ctx = this.offscreenCanvas.getContext('2d') as CanvasRenderingContext2D;
    }
  }

  async loadTemplates(names: string[]): Promise<void> {
    const promises = names.map(async (name) => {
      if (this.templates.has(name)) return;
      try {
        const base = `/label-templates/${name}`;
        const manifestRes = await fetch(`${base}/manifest.json`);
        if (!manifestRes.ok) throw new Error(`Template not found: ${name}`);
        const manifest: TemplateManifest = await manifestRes.json();

        // Validate
        if (manifest.kind === 'highlight' && manifest.secondary) throw new Error(`highlight template ${name} cannot have secondary`);
        if (manifest.kind === 'regular' && !manifest.secondary) throw new Error(`regular template ${name} must have secondary`);

        const required = [
          'primary_left-cap.svg',
          'primary_middle.svg',
          'primary_right-cap.svg',
          'primary_pointer.svg'
        ];
        if (manifest.kind === 'regular') {
          required.push('secondary_left-cap.svg', 'secondary_middle.svg', 'secondary_right-cap.svg');
        }

        const fetches = await Promise.all(required.map(f => fetch(`${base}/${f}`).then(r => {
          if (!r.ok) throw new Error(`Missing required asset: ${f}`);
          return r.text();
        })));

        if (manifest.kind === 'regular') {
          const stray = await fetch(`${base}/secondary_pointer.svg`);
          if (stray.ok) console.warn(`Template "${name}" contains secondary_pointer.svg. Secondary backplates never have pointers. This file is ignored.`);
        }

        const normalizedFetches = fetches.map((svgString, idx) => {
          let cssVar = '--primary-backplate-fill';
          if (manifest.kind === 'regular' && idx >= 4) {
            cssVar = '--secondary-backplate-fill';
          } else if (idx === 3) {
            cssVar = manifest.primary.pointer.independentColor ? '--pointer-fill' : '--primary-backplate-fill';
          }
          return normalizeSvg(svgString, cssVar);
        });

        const pmDim = parseMiddleSourceDimensions(normalizedFetches[1]);
        const template: LoadedTemplate = {
          manifest,
          primaryLeftCap: normalizedFetches[0],
          primaryMiddleInner: extractSvgInner(normalizedFetches[1]),
          primaryMiddleSrcWidth: pmDim.sourceWidth,
          primaryMiddleSrcHeight: pmDim.sourceHeight,
          primaryRightCap: normalizedFetches[2],
          primaryPointer: normalizedFetches[3],
        };

        if (manifest.kind === 'regular') {
          const smDim = parseMiddleSourceDimensions(normalizedFetches[5]);
          template.secondaryLeftCap = normalizedFetches[4];
          template.secondaryMiddleInner = extractSvgInner(normalizedFetches[5]);
          template.secondaryMiddleSrcWidth = smDim.sourceWidth;
          template.secondaryMiddleSrcHeight = smDim.sourceHeight;
          template.secondaryRightCap = normalizedFetches[6];
        }

        this.templates.set(name, template);
      } catch (err) {
        console.error(`Error loading template ${name}:`, err);
      }
    });

    await Promise.all(promises);

    // Preload fonts
    const fontsToLoad = new Set<string>();
    this.templates.forEach(tpl => {
      const { typography: pt } = tpl.manifest.primary;
      fontsToLoad.add(`${pt.fontWeight} ${pt.fontSize}px ${pt.fontFamily}`);
      if (tpl.manifest.secondary) {
        const { typography: st } = tpl.manifest.secondary;
        fontsToLoad.add(`${st.fontWeight} ${st.fontSize}px ${st.fontFamily}`);
      }
    });

    const fontPromises = Array.from(fontsToLoad).map(font => {
      return document.fonts.load(font).catch(e => console.warn(`Failed to load font ${font}`, e));
    });
    await Promise.all(fontPromises);
  }

  private measureWithLetterSpacing(text: string, typo: Typography): number {
    this.ctx.font = `${typo.fontWeight} ${typo.fontSize}px ${typo.fontFamily}`;
    const transformed = transformText(text, typo.textTransform);
    let width = 0;
    
    if (typo.maxWidth && typo.maxWidth > 0) {
      const words = transformed.split(' ');
      let currentLine = '';
      let maxWidthFound = 0;
      
      for (let i = 0; i < words.length; i++) {
        const testLine = currentLine + words[i] + ' ';
        const metrics = this.ctx.measureText(testLine);
        const ls = typo.letterSpacing || 0;
        const testWidth = metrics.width + ls * Math.max(0, testLine.length - 1);
        
        if (testWidth > typo.maxWidth && i > 0) {
          maxWidthFound = Math.max(maxWidthFound, this.ctx.measureText(currentLine).width + ls * Math.max(0, currentLine.length - 1));
          currentLine = words[i] + ' ';
        } else {
          currentLine = testLine;
        }
      }
      maxWidthFound = Math.max(maxWidthFound, this.ctx.measureText(currentLine.trim()).width + (typo.letterSpacing || 0) * Math.max(0, currentLine.trim().length - 1));
      width = maxWidthFound;
    } else {
      const metrics = this.ctx.measureText(transformed);
      width = metrics.width + (typo.letterSpacing || 0) * Math.max(0, transformed.length - 1);
    }
    return Math.ceil(width);
  }

  createLabel(opts: {
    id: string;
    lngLat: [number, number];
    text: string | { primary: string; secondary?: string };
    template: string;
    theme?: Theme;
    onClick?: (id: string) => void;
  }): LabelHandle {
    if (!this.templates.has(opts.template)) {
      throw new Error(`Template ${opts.template} not preloaded`);
    }

    const markerEl = document.createElement('div');
    markerEl.className = `label-marker label-marker-${opts.id}`;
    markerEl.dataset.template = opts.template;

    if (opts.theme?.primaryBackplateFill) markerEl.style.setProperty('--primary-backplate-fill', opts.theme.primaryBackplateFill);
    if (opts.theme?.secondaryBackplateFill) markerEl.style.setProperty('--secondary-backplate-fill', opts.theme.secondaryBackplateFill);
    if (opts.theme?.primaryTextColor) markerEl.style.setProperty('--primary-text-color', opts.theme.primaryTextColor);
    if (opts.theme?.secondaryTextColor) markerEl.style.setProperty('--secondary-text-color', opts.theme.secondaryTextColor);
    if (opts.theme?.accentFill) markerEl.style.setProperty('--accent-fill', opts.theme.accentFill);
    
    // Default pointer fill to primary backplate fill
    markerEl.style.setProperty('--pointer-fill', opts.theme?.pointerFill || opts.theme?.primaryBackplateFill || '#ffffff');
    if (!opts.theme?.pointerFill && !opts.theme?.primaryBackplateFill) {
       markerEl.style.setProperty('--pointer-fill', 'var(--primary-backplate-fill, #ffffff)');
    } else if (opts.theme?.pointerFill) {
       markerEl.style.setProperty('--pointer-fill', opts.theme.pointerFill);
    }

    const handle: LabelHandle = {
      id: opts.id,
      setText: (text: string | { primary: string; secondary?: string }) => {
        opts.text = text;
        this.render(handle, opts.template, opts.text, opts.onClick);
      },
      setTemplate: (name: string) => {
        if (!this.templates.has(name)) return;
        opts.template = name;
        markerEl.dataset.template = name;
        this.render(handle, opts.template, opts.text, opts.onClick);
      },
      setTheme: (theme: Partial<Theme>) => {
        opts.theme = { ...opts.theme, ...theme };
        if (theme.primaryBackplateFill) markerEl.style.setProperty('--primary-backplate-fill', theme.primaryBackplateFill);
        if (theme.secondaryBackplateFill) markerEl.style.setProperty('--secondary-backplate-fill', theme.secondaryBackplateFill);
        if (theme.primaryTextColor) markerEl.style.setProperty('--primary-text-color', theme.primaryTextColor);
        if (theme.secondaryTextColor) markerEl.style.setProperty('--secondary-text-color', theme.secondaryTextColor);
        if (theme.accentFill) markerEl.style.setProperty('--accent-fill', theme.accentFill);
        if (theme.pointerFill) markerEl.style.setProperty('--pointer-fill', theme.pointerFill);
      },
      remove: () => {
        this.handles.delete(opts.id);
      },
      getElement: () => markerEl,
      getLngLat: () => opts.lngLat,
      getRasterizedImage: async () => {
        const tpl = this.templates.get(opts.template);
        if (!tpl) throw new Error('Template not found');
        
        const { svg: svgString } = LabelMarkerManager.prototype.buildTemplateSvg.call(this, tpl, opts.text, opts.theme);
        
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
        const img = new Image();
        return new Promise<HTMLImageElement>((resolve, reject) => {
          img.onload = () => resolve(img);
          img.onerror = () => reject();
          img.src = url;
        });
      }
    };

    this.render(handle, opts.template, opts.text, opts.onClick);
    this.handles.set(opts.id, handle);
    return handle;
  }

  private buildTemplateHtml(tpl: LoadedTemplate, textInput: string | { primary: string; secondary?: string }): { html: string, width: number, height: number, anchorX: number, anchorY: number } {
    const { manifest } = tpl;
    
    let primaryText = '';
    let secondaryText = '';
    if (typeof textInput === 'string') {
      primaryText = textInput;
    } else {
      primaryText = textInput.primary;
      secondaryText = textInput.secondary || '';
    }

    if (manifest.kind === 'highlight' && secondaryText !== '') {
      throw new Error("Highlight templates cannot have secondary text");
    }

    const { primary, secondary } = manifest;

    // Primary
    const primaryTextWidth = this.measureWithLetterSpacing(primaryText, primary.typography);
    const primaryWidth = Math.max(primary.minWidth, primaryTextWidth + 2 * primary.paddingX);
    const primaryEffectiveCapWidth = Math.min(primary.capWidth, primaryWidth / 2);
    const primaryMiddleStretched = Math.max(0, primaryWidth - 2 * primaryEffectiveCapWidth);

    // Secondary
    let secondaryWidth = 0;
    let secondaryMiddleStretched = 0;
    let secondaryEffectiveCapWidth = 0;
    const secondaryVisible = manifest.kind === 'regular' && secondaryText !== '';
    if (secondaryVisible && secondary) {
      const secondaryTextWidth = this.measureWithLetterSpacing(secondaryText, secondary.typography);
      secondaryWidth = Math.max(secondary.minWidth, secondaryTextWidth + 2 * secondary.paddingX);
      secondaryEffectiveCapWidth = Math.min(secondary.capWidth, secondaryWidth / 2);
      secondaryMiddleStretched = Math.max(0, secondaryWidth - 2 * secondaryEffectiveCapWidth);
    }

    const { pointer } = primary;
    const pointerOverhang = pointer.height;

    // Dimensions
    const gap = secondaryVisible && secondary ? secondary.gap : 0;
    const hasAbove = secondaryVisible && secondary?.position === 'above';
    const hasBelow = secondaryVisible && secondary?.position === 'below';
    
    const heightAbove = hasAbove ? secondary!.height + gap : 0;
    // Removed unused heightBelow
    
    // The final marker height is returned below

    // We compute max width including overhang later.
    // First, align backplates.
    let primaryLeft = 0;
    let secondaryLeft = 0;

    if (secondaryVisible && secondary) {
      if (secondary.align === 'left') {
        primaryLeft = 0;
        secondaryLeft = 0;
      } else if (secondary.align === 'right') {
        const maxW = Math.max(primaryWidth, secondaryWidth);
        primaryLeft = maxW - primaryWidth;
        secondaryLeft = maxW - secondaryWidth;
      } else { // center
        const maxW = Math.max(primaryWidth, secondaryWidth);
        primaryLeft = (maxW - primaryWidth) / 2;
        secondaryLeft = (maxW - secondaryWidth) / 2;
      }
    }

    // Now compute pointer position relative to primaryLeft/primaryTop
    const primaryTop = hasAbove ? heightAbove + (pointer.attachEdge === 'top' ? pointerOverhang : 0) : (pointer.attachEdge === 'top' ? pointerOverhang : 0);
    
    let ptrLeft = 0;
    let ptrTop = 0;

    if (pointer.attachEdge === 'bottom') {
      ptrTop = primaryTop + primary.height - 1;
      if (pointer.attachFrom === 'left') ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === 'right') ptrLeft = primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === 'top') {
      ptrTop = primaryTop - pointer.height + 1;
      if (pointer.attachFrom === 'left') ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === 'right') ptrLeft = primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === 'left') {
      ptrLeft = primaryLeft - pointer.width + 1;
      if (pointer.attachFrom === 'top') ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === 'bottom') ptrTop = primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
    } else if (pointer.attachEdge === 'right') {
      ptrLeft = primaryLeft + primaryWidth - 1;
      if (pointer.attachFrom === 'top') ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === 'bottom') ptrTop = primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
    }

    // Shift everything if pointer goes negative
    const minLeft = Math.min(primaryLeft, secondaryLeft, ptrLeft);
    if (minLeft < 0) {
      primaryLeft -= minLeft;
      secondaryLeft -= minLeft;
      ptrLeft -= minLeft;
    }
    
    const minTop = Math.min(primaryTop, hasAbove ? 0 : 99999, ptrTop);
    let shiftY = 0;
    if (minTop < 0) {
      shiftY = -minTop;
    }

    const finalPrimaryTop = primaryTop + shiftY;
    const finalSecondaryTop = hasAbove ? shiftY : finalPrimaryTop + primary.height + (pointer.attachEdge === 'bottom' ? pointerOverhang : 0) + gap;
    const finalPtrTop = ptrTop + shiftY;

    const markerWidth = Math.ceil(Math.max(primaryLeft + primaryWidth, secondaryVisible ? secondaryLeft + secondaryWidth : 0, ptrLeft + pointer.width));
    const finalMarkerHeight = Math.ceil(Math.max(finalPrimaryTop + primary.height, secondaryVisible ? finalSecondaryTop + secondary!.height : 0, finalPtrTop + pointer.height));

    const buildTypographyCss = (typo: Typography) => `
      font-family: ${typo.fontFamily};
      font-size: ${typo.fontSize}px;
      font-weight: ${typo.fontWeight};
      color: ${typo.color};
      letter-spacing: ${typo.letterSpacing || 0}px;
      line-height: ${typo.lineHeight || 1.2};
      text-transform: ${typo.textTransform || 'none'};
      text-align: ${typo.textAlign || 'center'};
    `;

    let html = '';

    // Secondary Above
    if (secondaryVisible && hasAbove && secondary) {
      html += `
        <div class="backplate secondary" style="position: absolute; left: ${secondaryLeft}px; top: ${finalSecondaryTop}px; width: ${secondaryWidth}px; height: ${secondary.height}px; display: flex; flex-direction: row; pointer-events: none;">
          <div class="cap left" style="width: ${secondaryEffectiveCapWidth}px; height: ${secondary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none;">${tpl.secondaryLeftCap}</div>
          ${secondaryMiddleStretched > 0 ? `<svg class="middle" width="${secondaryMiddleStretched}" height="${secondary.height}" viewBox="0 0 ${tpl.secondaryMiddleSrcWidth} ${tpl.secondaryMiddleSrcHeight}" preserveAspectRatio="none" style="display: block; flex-shrink: 0; pointer-events: none;">${tpl.secondaryMiddleInner}</svg>` : ''}
          <div class="cap right" style="width: ${secondaryEffectiveCapWidth}px; height: ${secondary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none; display: flex; justify-content: flex-end;">${tpl.secondaryRightCap}</div>
          <span class="text" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; user-select: none; ${buildTypographyCss(secondary.typography)}">${transformText(secondaryText, secondary.typography.textTransform)}</span>
        </div>
      `;
    }

    // Primary
    html += `
      <div class="backplate primary" style="position: absolute; left: ${primaryLeft}px; top: ${finalPrimaryTop}px; width: ${primaryWidth}px; height: ${primary.height}px; display: flex; flex-direction: row; pointer-events: auto;">
        <div class="cap left" style="width: ${primaryEffectiveCapWidth}px; height: ${primary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none;">${tpl.primaryLeftCap}</div>
        ${primaryMiddleStretched > 0 ? `<svg class="middle" width="${primaryMiddleStretched}" height="${primary.height}" viewBox="0 0 ${tpl.primaryMiddleSrcWidth} ${tpl.primaryMiddleSrcHeight}" preserveAspectRatio="none" style="display: block; flex-shrink: 0; pointer-events: none;">${tpl.primaryMiddleInner}</svg>` : ''}
        <div class="cap right" style="width: ${primaryEffectiveCapWidth}px; height: ${primary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none; display: flex; justify-content: flex-end;">${tpl.primaryRightCap}</div>
        <span class="text" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; user-select: none; ${buildTypographyCss(primary.typography)}">${transformText(primaryText, primary.typography.textTransform)}</span>
      </div>
    `;

    // Pointer
    if (pointer.width > 0) {
      html += `
        <div class="pointer" data-independent-color="${pointer.independentColor ? 'true' : 'false'}" style="position: absolute; left: ${ptrLeft}px; top: ${finalPtrTop}px; width: ${pointer.width}px; height: ${pointer.height}px; pointer-events: none;">
          ${tpl.primaryPointer}
        </div>
      `;
    }

    // Secondary Below
    if (secondaryVisible && hasBelow && secondary) {
      html += `
        <div class="backplate secondary" style="position: absolute; left: ${secondaryLeft}px; top: ${finalSecondaryTop}px; width: ${secondaryWidth}px; height: ${secondary.height}px; display: flex; flex-direction: row; pointer-events: none;">
          <div class="cap left" style="width: ${secondaryEffectiveCapWidth}px; height: ${secondary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none;">${tpl.secondaryLeftCap}</div>
          ${secondaryMiddleStretched > 0 ? `<svg class="middle" width="${secondaryMiddleStretched}" height="${secondary.height}" viewBox="0 0 ${tpl.secondaryMiddleSrcWidth} ${tpl.secondaryMiddleSrcHeight}" preserveAspectRatio="none" style="display: block; flex-shrink: 0; pointer-events: none;">${tpl.secondaryMiddleInner}</svg>` : ''}
          <div class="cap right" style="width: ${secondaryEffectiveCapWidth}px; height: ${secondary.height}px; flex-shrink: 0; overflow: hidden; pointer-events: none; display: flex; justify-content: flex-end;">${tpl.secondaryRightCap}</div>
          <span class="text" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; user-select: none; ${buildTypographyCss(secondary.typography)}">${transformText(secondaryText, secondary.typography.textTransform)}</span>
        </div>
      `;
    }

    // Compute pointer tip mapbox offset. The pointer tip is at (ptrLeft + pointer.tipX, finalPtrTop + pointer.tipY)
    const anchorX = ptrLeft + pointer.tipX;
    const anchorY = finalPtrTop + pointer.tipY;

    return { html, width: markerWidth, height: finalMarkerHeight, anchorX, anchorY };
  }

  private buildTemplateSvg(tpl: LoadedTemplate, textInput: string | { primary: string; secondary?: string }, theme: Theme | undefined): { svg: string, width: number, height: number, anchorX: number, anchorY: number } {
    const { manifest } = tpl;
    
    let primaryText = '';
    let secondaryText = '';
    if (typeof textInput === 'string') {
      primaryText = textInput;
    } else {
      primaryText = textInput.primary;
      secondaryText = textInput.secondary || '';
    }

    const { primary, secondary } = manifest;

    // Primary
    const primaryTextWidth = this.measureWithLetterSpacing(primaryText, primary.typography);
    const primaryWidth = Math.max(primary.minWidth, primaryTextWidth + 2 * primary.paddingX);
    const primaryEffectiveCapWidth = Math.min(primary.capWidth, primaryWidth / 2);
    const primaryMiddleStretched = Math.max(0, primaryWidth - 2 * primaryEffectiveCapWidth);

    // Secondary
    let secondaryWidth = 0;
    let secondaryMiddleStretched = 0;
    let secondaryEffectiveCapWidth = 0;
    const secondaryVisible = manifest.kind === 'regular' && secondaryText !== '';
    if (secondaryVisible && secondary) {
      const secondaryTextWidth = this.measureWithLetterSpacing(secondaryText, secondary.typography);
      secondaryWidth = Math.max(secondary.minWidth, secondaryTextWidth + 2 * secondary.paddingX);
      secondaryEffectiveCapWidth = Math.min(secondary.capWidth, secondaryWidth / 2);
      secondaryMiddleStretched = Math.max(0, secondaryWidth - 2 * secondaryEffectiveCapWidth);
    }

    const { pointer } = primary;
    const pointerOverhang = pointer.height;

    // Dimensions
    const gap = secondaryVisible && secondary ? secondary.gap : 0;
    const hasAbove = secondaryVisible && secondary?.position === 'above';
    const hasBelow = secondaryVisible && secondary?.position === 'below';
    
    const heightAbove = hasAbove ? secondary!.height + gap : 0;
    
    let primaryLeft = 0;
    let secondaryLeft = 0;

    if (secondaryVisible && secondary) {
      if (secondary.align === 'left') {
        primaryLeft = 0;
        secondaryLeft = 0;
      } else if (secondary.align === 'right') {
        const maxW = Math.max(primaryWidth, secondaryWidth);
        primaryLeft = maxW - primaryWidth;
        secondaryLeft = maxW - secondaryWidth;
      } else {
        const maxW = Math.max(primaryWidth, secondaryWidth);
        primaryLeft = (maxW - primaryWidth) / 2;
        secondaryLeft = (maxW - secondaryWidth) / 2;
      }
    }

    const primaryTop = hasAbove ? heightAbove + (pointer.attachEdge === 'top' ? pointerOverhang : 0) : (pointer.attachEdge === 'top' ? pointerOverhang : 0);
    
    let ptrLeft = 0;
    let ptrTop = 0;

    if (pointer.attachEdge === 'bottom') {
      ptrTop = primaryTop + primary.height - 1;
      if (pointer.attachFrom === 'left') ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === 'right') ptrLeft = primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === 'top') {
      ptrTop = primaryTop - pointer.height + 1;
      if (pointer.attachFrom === 'left') ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === 'right') ptrLeft = primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === 'left') {
      ptrLeft = primaryLeft - pointer.width + 1;
      if (pointer.attachFrom === 'top') ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === 'bottom') ptrTop = primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
    } else if (pointer.attachEdge === 'right') {
      ptrLeft = primaryLeft + primaryWidth - 1;
      if (pointer.attachFrom === 'top') ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === 'bottom') ptrTop = primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
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
    const finalSecondaryTop = hasAbove ? shiftY : finalPrimaryTop + primary.height + (pointer.attachEdge === 'bottom' ? pointerOverhang : 0) + gap;
    const finalPtrTop = ptrTop + shiftY;

    const markerWidth = Math.ceil(Math.max(primaryLeft + primaryWidth, secondaryVisible ? secondaryLeft + secondaryWidth : 0, ptrLeft + pointer.width));
    const finalMarkerHeight = Math.ceil(Math.max(finalPrimaryTop + primary.height, secondaryVisible ? finalSecondaryTop + secondary!.height : 0, finalPtrTop + pointer.height));

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${markerWidth}" height="${finalMarkerHeight}">`;
    
    svg += `
      <style>
        :root {
          --primary-backplate-fill: ${theme?.primaryBackplateFill || '#ffffff'};
          --secondary-backplate-fill: ${theme?.secondaryBackplateFill || '#ffffff'};
          --pointer-fill: ${theme?.pointerFill || theme?.primaryBackplateFill || '#ffffff'};
          --primary-text-color: ${theme?.primaryTextColor || '#000000'};
          --secondary-text-color: ${theme?.secondaryTextColor || '#000000'};
          --accent-fill: ${theme?.accentFill || '#000000'};
        }
      </style>
    `;

    // Secondary Above
    if (secondaryVisible && hasAbove && secondary) {
      svg += `
        <svg x="${secondaryLeft}" y="${finalSecondaryTop}" width="${secondaryWidth}" height="${secondary.height}">
          <svg x="0" y="0" width="${secondaryEffectiveCapWidth}" height="${secondary.height}" preserveAspectRatio="none">${tpl.secondaryLeftCap}</svg>
          ${secondaryMiddleStretched > 0 ? `<svg x="${secondaryEffectiveCapWidth}" y="0" width="${secondaryMiddleStretched}" height="${secondary.height}" viewBox="0 0 ${tpl.secondaryMiddleSrcWidth} ${tpl.secondaryMiddleSrcHeight}" preserveAspectRatio="none">${tpl.secondaryMiddleInner}</svg>` : ''}
          <svg x="${secondaryWidth - secondaryEffectiveCapWidth}" y="0" width="${secondaryEffectiveCapWidth}" height="${secondary.height}" preserveAspectRatio="none">${tpl.secondaryRightCap}</svg>
          <text x="50%" y="50%" font-family="${secondary.typography.fontFamily}" font-size="${secondary.typography.fontSize}px" font-weight="${secondary.typography.fontWeight}" fill="${secondary.typography.color}" text-anchor="middle" dominant-baseline="central" letter-spacing="${secondary.typography.letterSpacing || 0}">${transformText(secondaryText, secondary.typography.textTransform)}</text>
        </svg>
      `;
    }

    // Primary
    svg += `
      <svg x="${primaryLeft}" y="${finalPrimaryTop}" width="${primaryWidth}" height="${primary.height}">
        <svg x="0" y="0" width="${primaryEffectiveCapWidth}" height="${primary.height}" preserveAspectRatio="none">${tpl.primaryLeftCap}</svg>
        ${primaryMiddleStretched > 0 ? `<svg x="${primaryEffectiveCapWidth}" y="0" width="${primaryMiddleStretched}" height="${primary.height}" viewBox="0 0 ${tpl.primaryMiddleSrcWidth} ${tpl.primaryMiddleSrcHeight}" preserveAspectRatio="none">${tpl.primaryMiddleInner}</svg>` : ''}
        <svg x="${primaryWidth - primaryEffectiveCapWidth}" y="0" width="${primaryEffectiveCapWidth}" height="${primary.height}" preserveAspectRatio="none">${tpl.primaryRightCap}</svg>
        <text x="50%" y="50%" font-family="${primary.typography.fontFamily}" font-size="${primary.typography.fontSize}px" font-weight="${primary.typography.fontWeight}" fill="${primary.typography.color}" text-anchor="middle" dominant-baseline="central" letter-spacing="${primary.typography.letterSpacing || 0}">${transformText(primaryText, primary.typography.textTransform)}</text>
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
          ${secondaryMiddleStretched > 0 ? `<svg x="${secondaryEffectiveCapWidth}" y="0" width="${secondaryMiddleStretched}" height="${secondary.height}" viewBox="0 0 ${tpl.secondaryMiddleSrcWidth} ${tpl.secondaryMiddleSrcHeight}" preserveAspectRatio="none">${tpl.secondaryMiddleInner}</svg>` : ''}
          <svg x="${secondaryWidth - secondaryEffectiveCapWidth}" y="0" width="${secondaryEffectiveCapWidth}" height="${secondary.height}" preserveAspectRatio="none">${tpl.secondaryRightCap}</svg>
          <text x="50%" y="50%" font-family="${secondary.typography.fontFamily}" font-size="${secondary.typography.fontSize}px" font-weight="${secondary.typography.fontWeight}" fill="${secondary.typography.color}" text-anchor="middle" dominant-baseline="central" letter-spacing="${secondary.typography.letterSpacing || 0}">${transformText(secondaryText, secondary.typography.textTransform)}</text>
        </svg>
      `;
    }

    svg += '</svg>';

    const anchorX = ptrLeft + pointer.tipX;
    const anchorY = finalPtrTop + pointer.tipY;

    return { svg, width: markerWidth, height: finalMarkerHeight, anchorX, anchorY };
  }


  getPreviewHtml(templateName: string, text: string | { primary: string; secondary?: string }): string | null {
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

  private render(handle: LabelHandle, templateName: string, text: string | { primary: string; secondary?: string }, onClick?: (id: string) => void) {
    const tpl = this.templates.get(templateName);
    if (!tpl) return;
    const markerEl = handle.getElement();
    
    const data = this.buildTemplateHtml(tpl, text);
    
    markerEl.style.width = `${data.width}px`;
    markerEl.style.height = `${data.height}px`;
    markerEl.dataset.width = data.width.toString();
    markerEl.dataset.height = data.height.toString();
    markerEl.dataset.anchorX = data.anchorX.toString();
    markerEl.dataset.anchorY = data.anchorY.toString();

    markerEl.innerHTML = data.html;

    if (onClick) {
      const primaryBackplate = markerEl.querySelector('.backplate.primary') as HTMLElement;
      if (primaryBackplate) {
        primaryBackplate.style.cursor = 'pointer';
        primaryBackplate.addEventListener('click', (e) => {
          e.stopPropagation();
          onClick(handle.id);
        });
        primaryBackplate.addEventListener('mousedown', (e) => e.stopPropagation());
      }
    }

    const markerObj = (this.map as any)?._markers?.find((m: any) => m.getElement() === markerEl);
    if (markerObj) {
      markerObj.setOffset([-data.anchorX, -data.anchorY]);
    } else {
      markerEl.style.transform = `translate(${-data.anchorX}px, ${-data.anchorY}px)`;
    }
  }

  async getRasterizedImage(id: string): Promise<HTMLImageElement | null> {
    const handle = this.handles.get(id);
    if (!handle) return null;
    return handle.getRasterizedImage();
  }

  getAnchorOffset(id: string): { x: number, y: number } | null {
    const handle = this.handles.get(id);
    if (!handle) return null;
    const el = handle.getElement();
    return {
      x: parseFloat(el.dataset.anchorX || '0'),
      y: parseFloat(el.dataset.anchorY || '0')
    };
  }

  clear() {
    this.handles.clear();
  }
}

export const globalLabelManager = new LabelMarkerManager();
