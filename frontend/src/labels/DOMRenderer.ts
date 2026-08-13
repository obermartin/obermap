import type { LoadedTemplate, Typography, Theme } from "./types";
import { transformText } from "./utils/textUtils";

export class DOMRenderer {
  private offscreenCanvas: HTMLCanvasElement | OffscreenCanvas;
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor() {
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

  measureWithLetterSpacing(text: string, typo: Typography): number {
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

  buildTemplateHtml(
    tpl: LoadedTemplate,
    textInput: string | { primary: string; secondary?: string },
    hidePointer?: boolean,
    theme?: Theme
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

    const ptrMargin = pointer.margin || 0;
    const pointerOverhangTop = pointer.attachEdge === "top" ? pointerOverhang + ptrMargin : 0;
    const pointerOverhangBottom = pointer.attachEdge === "bottom" ? pointerOverhang + ptrMargin : 0;
    const pointerOverhangLeft = pointer.attachEdge === "left" ? pointer.width + ptrMargin : 0;
    const pointerOverhangRight = pointer.attachEdge === "right" ? pointer.width + ptrMargin : 0;

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

    // Initial offsets
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

    let ptrLeft = 0;
    let ptrTop = 0;

    if (pointer.attachEdge === "bottom") {
      ptrTop = primaryTop + primary.height - 1 + ptrMargin;
      if (pointer.attachFrom === "left") ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "right") ptrLeft = primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "center") ptrLeft = primaryLeft + primaryWidth / 2 + pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === "top") {
      ptrTop = primaryTop - pointer.height + 1 - ptrMargin;
      if (pointer.attachFrom === "left") ptrLeft = primaryLeft + pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "right") ptrLeft = primaryLeft + primaryWidth - pointer.attachOffset - pointer.tipX;
      else if (pointer.attachFrom === "center") ptrLeft = primaryLeft + primaryWidth / 2 + pointer.attachOffset - pointer.tipX;
    } else if (pointer.attachEdge === "left") {
      ptrLeft = primaryLeft - pointer.width + 1 - ptrMargin;
      if (pointer.attachFrom === "top") ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "bottom") ptrTop = primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "center") ptrTop = primaryTop + primary.height / 2 + pointer.attachOffset - pointer.tipY;
    } else if (pointer.attachEdge === "right") {
      ptrLeft = primaryLeft + primaryWidth - 1 + ptrMargin;
      if (pointer.attachFrom === "top") ptrTop = primaryTop + pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "bottom") ptrTop = primaryTop + primary.height - pointer.attachOffset - pointer.tipY;
      else if (pointer.attachFrom === "center") ptrTop = primaryTop + primary.height / 2 + pointer.attachOffset - pointer.tipY;
    }

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
        <span class="text" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; user-select: none; transform: translateY(${primary.typography.verticalOffset || 0}px); ${buildTypographyCss(primary.typography, "--primary-text-color")}">${transformText(primaryText, primary.typography.textTransform)}</span>
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
          <span class="text" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; user-select: none; transform: translateY(${secondary.typography.verticalOffset || 0}px); ${buildTypographyCss(secondary.typography, "--secondary-text-color")}">${transformText(secondaryText, secondary.typography.textTransform)}</span>
        </div>
      `;
    }

    let anchorX = ptrLeft + pointer.tipX;
    let anchorY = finalPtrTop + pointer.tipY;

    if (pointer.width === 0 || hidePointer) {
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

  getPreviewHtml(
    tpl: LoadedTemplate,
    text: string | { primary: string; secondary?: string },
  ): string | null {
    if (!tpl) return null;
    const data = this.buildTemplateHtml(tpl, text);

    return `
      <div class="label-marker" style="position: relative; width: ${data.width}px; height: ${data.height}px; pointer-events: none;">
        ${data.html}
      </div>
    `;
  }
}
