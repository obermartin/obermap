import maplibregl from "maplibre-gl";
import type { LabelHandle, Theme } from "./types";
import { TemplateLoader } from "./TemplateLoader";
import { DOMRenderer } from "./DOMRenderer";
import { Rasterizer } from "./Rasterizer";

export type { LabelHandle, Theme };

export class LabelMarkerManager {
  private map: maplibregl.Map | null;
  public loader: TemplateLoader;
  private renderer: DOMRenderer;
  private rasterizer: Rasterizer;
  private handles: Map<string, LabelHandle> = new Map();

  constructor(map: maplibregl.Map | null = null) {
    this.map = map;
    this.loader = new TemplateLoader();
    this.renderer = new DOMRenderer();
    this.rasterizer = new Rasterizer(this.renderer);
  }

  get templates() {
    return this.loader.templates;
  }

  async loadTemplates(names: string[]): Promise<void> {
    await this.loader.loadTemplates(names);
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
    if (!this.loader.templates.has(opts.template)) {
      throw new Error(`Template ${opts.template} not preloaded`);
    }

    const tpl = this.loader.getTemplate(opts.template)!;
    const man = tpl.manifest;

    const markerEl = document.createElement("div");
    markerEl.className = `label-marker label-marker-${opts.id}`;
    markerEl.dataset.template = opts.template;

    // Apply colors
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
        if (!this.loader.templates.has(name)) return;
        opts.template = name;
        markerEl.dataset.template = name;
        this.render(handle, opts.template, opts.text, opts.hidePointer, opts.onClick);
      },
      setTheme: (theme: Partial<Theme>) => {
        opts.theme = { ...opts.theme, ...theme };
        const currentTpl = this.loader.getTemplate(markerEl.dataset.template || "");
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
        const tpl = this.loader.getTemplate(opts.template);
        if (!tpl) throw new Error("Template not found");

        return this.rasterizer.getRasterizedImage(
          tpl,
          opts.text,
          opts.theme,
          opts.hidePointer,
          scale
        );
      },
    };

    this.render(handle, opts.template, opts.text, opts.hidePointer, opts.onClick);
    this.handles.set(opts.id, handle);
    return handle;
  }

  getPreviewHtml(
    templateName: string,
    text: string | { primary: string; secondary?: string },
  ): string | null {
    const tpl = this.loader.getTemplate(templateName);
    if (!tpl) return null;
    return this.renderer.getPreviewHtml(tpl, text);
  }

  private render(
    handle: LabelHandle,
    templateName: string,
    text: string | { primary: string; secondary?: string },
    hidePointer?: boolean,
    onClick?: (id: string) => void,
  ) {
    const tpl = this.loader.getTemplate(templateName);
    if (!tpl) return;
    const markerEl = handle.getElement();

    const data = this.renderer.buildTemplateHtml(tpl, text, hidePointer);

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
