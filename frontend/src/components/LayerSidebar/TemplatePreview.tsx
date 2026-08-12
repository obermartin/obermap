import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { LabelMarkerManager, type Theme } from "../../labels/LabelMarkerManager";

export const TemplatePreview: React.FC<{
  templateName?: string;
  hasSecondary: boolean;
  theme?: Theme;
}> = ({ templateName, hasSecondary, theme }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [manifest, setManifest] = useState<any>(null);

  useEffect(() => {
    if (!templateName) {
      const getContrastYIQ = (hexcolor: string) => {
        if (!hexcolor) return "#ffffff";
        let hex = hexcolor;
        if (hex.startsWith("#")) hex = hex.slice(1);
        if (hex.length === 3)
          hex = hex
            .split("")
            .map((c) => c + c)
            .join("");
        const r = parseInt(hex.substr(0, 2), 16) || 0;
        const g = parseInt(hex.substr(2, 2), 16) || 0;
        const b = parseInt(hex.substr(4, 2), 16) || 0;
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return yiq >= 128 ? "#000000" : "#ffffff";
      };

      const primaryColor = theme?.primaryBackplateFill || "#ffffff";
      const contrastColor = getContrastYIQ(primaryColor);

      let defaultHtml = "";
      if (hasSecondary) {
        defaultHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div class="custom-marker" style="pointer-events: none;">
              <div class="custom-marker-plate" style="background-color: ${primaryColor}; border-color: ${primaryColor === "#000000" || primaryColor === "#000" ? "rgba(255,255,255,0.1)" : primaryColor}">
                <div class="custom-marker-text" style="color: ${contrastColor}; display: flex; flex-direction: column; align-items: flex-start;">
                  <span style="font-size: 1.6em; line-height: 1;">Preview</span>
                  <span style="font-size: 1em; line-height: 1; margin-top: 2px;">Label</span>
                </div>
              </div>
              <div class="custom-marker-pointer" style="border-top-color: ${primaryColor}"></div>
            </div>
          </div>
        `;
      } else {
        defaultHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="position: relative; display: flex; align-items: center; width: 100px; height: 32px; pointer-events: none; margin-left: -20px;">
              <div class="custom-highlight-marker" style="background-color: ${primaryColor};">
                <div class="custom-highlight-plate" style="background-color: ${primaryColor};">
                  <div class="custom-highlight-text" style="color: ${contrastColor}">
                    Preview
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }
      setHtml(defaultHtml);
      return;
    }

    const manager = new LabelMarkerManager(null);
    const tryLoad = async (retries = 2) => {
      try {
        await manager.loadTemplates([templateName]);
        const p = manager.getPreviewHtml(
          templateName,
          hasSecondary ? { primary: "Preview", secondary: "Label" } : "Preview",
        );
        if (!p) throw new Error("Preview html is null");
        const tpl = manager.templates.get(templateName);
        if (tpl && tpl.manifest) setManifest(tpl.manifest);
        setHtml(p);
      } catch (e) {
        if (retries > 0) {
          setTimeout(() => tryLoad(retries - 1), 500);
        } else {
          console.error(e);
          setHtml(`<div style="color:red; font-size:10px;">Error</div>`);
        }
      }
    };
    tryLoad();
  }, [templateName, hasSecondary, theme]);

  if (!html)
    return (
      <div className="text-[10px] text-white/50">
        <Loader2 size={14} className="animate-spin" />
      </div>
    );

  const style: any = {};
  if (theme && manifest) {
    if (manifest.primary?.overrideColor)
      style["--primary-backplate-fill"] =
        theme.primaryBackplateFill || manifest.primary.color;
    if (manifest.secondary?.overrideColor)
      style["--secondary-backplate-fill"] =
        theme.secondaryBackplateFill || manifest.secondary.color;
    if (manifest.primary?.pointer?.overrideColor)
      style["--pointer-fill"] =
        theme.pointerFill || manifest.primary.pointer.color;
    style["--primary-text-color"] =
      theme.primaryTextColor || manifest.primary?.typography?.color;
    style["--secondary-text-color"] =
      theme.secondaryTextColor || manifest.secondary?.typography?.color;
    if (theme.accentFill) style["--accent-fill"] = theme.accentFill;
  }

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="scale-75 origin-center pointer-events-none"
      style={style}
    />
  );
};
