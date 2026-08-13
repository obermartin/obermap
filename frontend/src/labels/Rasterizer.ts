import type { LoadedTemplate, Theme } from "./types";
import { transformText } from "./utils/textUtils";
import { DOMRenderer } from "./DOMRenderer";

export class Rasterizer {
  private renderer: DOMRenderer;

  constructor(renderer: DOMRenderer) {
    this.renderer = renderer;
  }

  buildTemplateSvg(
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
    const primaryTextWidth = this.renderer.measureWithLetterSpacing(
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
      const secondaryTextWidth = this.renderer.measureWithLetterSpacing(
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

    const ptrMargin = pointer.margin || 0;
    const primaryTop = hasAbove
      ? heightAbove + (pointer.attachEdge === "top" ? pointerOverhang + ptrMargin : 0)
      : pointer.attachEdge === "top"
        ? pointerOverhang + ptrMargin
        : 0;

    let ptrLeft = 0;
    let ptrTop = 0;

    if (pointer.attachEdge === "bottom") {
      ptrTop = primaryTop + primary.height - 1 + ptrMargin;
      if (pointer.attachFrom === "left")
        ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "right")
        ptrLeft =
          primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "center")
        ptrLeft =
          primaryLeft + primaryWidth / 2 + pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === "top") {
      ptrTop = primaryTop - pointer.height + 1 - ptrMargin;
      if (pointer.attachFrom === "left")
        ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "right")
        ptrLeft =
          primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "center")
        ptrLeft =
          primaryLeft + primaryWidth / 2 + pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === "left") {
      ptrLeft = primaryLeft - pointer.width + 1 - ptrMargin;
      if (pointer.attachFrom === "top")
        ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "bottom")
        ptrTop =
          primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "center")
        ptrTop =
          primaryTop + primary.height / 2 + pointer.attachOffset - pointer.tipY;
    } else if (pointer.attachEdge === "right") {
      ptrLeft = primaryLeft + primaryWidth - 1 + ptrMargin;
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
          ${manifest?.primary?.overrideColor ? `--primary-backplate-fill: ${theme?.primaryBackplateFill || manifest?.primary?.color || "#ffffff"};` : ''}
          ${manifest?.secondary?.overrideColor ? `--secondary-backplate-fill: ${theme?.secondaryBackplateFill || manifest?.secondary?.color || "#ffffff"};` : ''}
          ${manifest?.primary?.pointer?.overrideColor ? `--pointer-fill: ${theme?.pointerFill || manifest?.primary?.pointer?.color || "#ffffff"};` : ''}
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
          <text x="50%" y="50%" dy="${secondary.typography.verticalOffset || 0}px" font-family="${secondary.typography.fontFamily}" font-size="${secondary.typography.fontSize}px" font-weight="${secondary.typography.fontWeight}" fill="var(--secondary-text-color, ${secondary.typography.color})" text-anchor="middle" dominant-baseline="central" letter-spacing="${secondary.typography.letterSpacing || 0}">${transformText(secondaryText, secondary.typography.textTransform)}</text>
        </svg>
      `;
    }

    // Primary
    svg += `
      <svg x="${primaryLeft}" y="${finalPrimaryTop}" width="${primaryWidth}" height="${primary.height}">
        <svg x="0" y="0" width="${primaryEffectiveCapWidth}" height="${primary.height}" preserveAspectRatio="none">${tpl.primaryLeftCap}</svg>
        ${primaryMiddleStretched > 0 ? `<svg x="${primaryEffectiveCapWidth}" y="0" width="${primaryMiddleStretched}" height="${primary.height}" viewBox="0 0 ${tpl.primaryMiddleSrcWidth} ${tpl.primaryMiddleSrcHeight}" preserveAspectRatio="none">${tpl.primaryMiddleInner}</svg>` : ""}
        <svg x="${primaryWidth - primaryEffectiveCapWidth}" y="0" width="${primaryEffectiveCapWidth}" height="${primary.height}" preserveAspectRatio="none">${tpl.primaryRightCap}</svg>
        <text x="50%" y="50%" dy="${primary.typography.verticalOffset || 0}px" font-family="${primary.typography.fontFamily}" font-size="${primary.typography.fontSize}px" font-weight="${primary.typography.fontWeight}" fill="var(--primary-text-color, ${primary.typography.color})" text-anchor="middle" dominant-baseline="central" letter-spacing="${primary.typography.letterSpacing || 0}">${transformText(primaryText, primary.typography.textTransform)}</text>
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
          <text x="50%" y="50%" dy="${secondary.typography.verticalOffset || 0}px" font-family="${secondary.typography.fontFamily}" font-size="${secondary.typography.fontSize}px" font-weight="${secondary.typography.fontWeight}" fill="var(--secondary-text-color, ${secondary.typography.color})" text-anchor="middle" dominant-baseline="central" letter-spacing="${secondary.typography.letterSpacing || 0}">${transformText(secondaryText, secondary.typography.textTransform)}</text>
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

  async getRasterizedImage(
    tpl: LoadedTemplate,
    textInput: string | { primary: string; secondary?: string },
    theme: Theme | undefined,
    hidePointer?: boolean,
    scale: number = 1
  ): Promise<HTMLImageElement> {
    const { svg: svgString } = this.buildTemplateSvg(
      tpl,
      textInput,
      theme,
      hidePointer,
      scale
    );

    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    const img = new Image();
    return new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject();
      img.src = url;
    });
  }
}
