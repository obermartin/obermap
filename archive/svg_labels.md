# Implementation Prompt: SVG Label Template System for Mapbox

## Context

I'm building a web app that uses **Mapbox GL JS** to render highly interactive maps with  labels and annotations placed on top of and adjacent to clickable map features. I want a flexible **label template system** where designers can drop in new SVG-based "container styles" (pill, callout bubble, notched tag, etc.) and the app uses them to render labels that automatically resize to fit dynamic text content.

This document specifies the system. Implement it as a self-contained module that can be imported and used from the rest of the app. Use **TypeScript**. Use **Mapbox GL JS v3+**.

## Architecture Overview

A **template** is a folder of static SVG assets plus a JSON manifest. Each label on the map is rendered by:

1. Loading the template (cached after first load).
2. Measuring the label's text width using the canvas API.
3. Computing the bubble's total width and stretching the middle SVG strip to fit.
4. Assembling a Mapbox HTML marker DOM element consisting of: left cap SVG + stretched middle SVG + right cap SVG + pointer SVG + a text element overlaid on top.
5. Positioning the marker so that the pointer's tip lands exactly on the supplied `[lng, lat]` coordinate.

The bubble has **no outline/stroke** — only fills — which means the pointer-to-bubble seam is handled by overlapping the pointer 1–2px into the bubble body with matching fill color. Do not attempt to compute a unified bubble+pointer outline path.

## Template Asset Format

Each template lives at `/public/label-templates/{template-name}/` and contains:

```
left-cap.svg
middle.svg
right-cap.svg
pointer.svg
manifest.json
```

### Manifest Schema

```ts
interface TemplateManifest {
  name: string;
  height: number;              // px, full bubble height
  capWidth: number;            // px, width of each cap
  contentPaddingX: number;     // px, horizontal space between text and bubble edges
  contentPaddingY: number;     // px, vertical space
  minWidth: number;            // px, smallest allowed total bubble width
  pointer: {
    width: number;             // px
    height: number;            // px
    attachEdge: 'top' | 'bottom' | 'left' | 'right';
    attachFrom: 'left' | 'right' | 'top' | 'bottom';
    attachOffset: number;      // px from the reference edge
    tipX: number;              // px within the pointer SVG
    tipY: number;              // px within the pointer SVG
  };
  anchorX: number;             // px within the assembled marker — sits on map coord
  anchorY: number;             // px within the assembled marker — sits on map coord
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;           // default; can be overridden per-marker
}
```

### SVG Assets

- All four SVGs share the same `height` from the manifest.
- The middle SVG is **1 px wide** and is rendered with `preserveAspectRatio="none"` and a runtime-computed `width` attribute to stretch horizontally.
- SVGs use CSS custom properties for colors (`fill="var(--bubble-fill, #ffffff)"`) so the app can theme them per-marker.
- Inline the SVGs into the DOM (don't use `<img src>`) so CSS variables and styling work.

## Module API

Implement a class `LabelMarkerManager` with this API:

```ts
class LabelMarkerManager {
  constructor(map: mapboxgl.Map);

  /**
   * Preload one or more templates. Resolves once all assets are fetched and parsed.
   * Templates are cached; calling again with a known name is a no-op.
   */
  loadTemplates(names: string[]): Promise<void>;

  /**
   * Create a label marker on the map.
   * Returns a handle that can be used to update text, change template, or remove.
   */
  createLabel(opts: {
    id: string;
    lngLat: [number, number];
    text: string;
    template: string;          // template name, must be preloaded
    theme?: {
      bubbleFill?: string;
      textColor?: string;
      accentFill?: string;
    };
    onClick?: (id: string) => void;
  }): LabelHandle;

  /** Remove a label by id. */
  remove(id: string): void;

  /** Remove all labels. */
  clear(): void;
}

interface LabelHandle {
  id: string;
  setText(text: string): void;       // re-measures and re-stretches
  setTemplate(name: string): void;   // swap template, keep text and lngLat
  setTheme(theme: Partial<Theme>): void;
  remove(): void;
}
```

## Implementation Requirements

### Text Measurement

- Use a single shared `OffscreenCanvas` (or hidden `<canvas>` fallback) for `measureText`.
- Set the canvas context's `font` to match the template's `fontFamily`, `fontSize`, `fontWeight` before measuring.
- **Wait for fonts before measuring**: in `loadTemplates`, after the SVGs are fetched, await `document.fonts.load(\`${weight} ${size}px ${family}\`)` for each unique font in the loaded manifests. Cache the "ready" state per font.

### Width Computation

```
textWidth = measureText(text)
totalWidth = max(minWidth, textWidth + 2 * contentPaddingX)
middleWidth = totalWidth - 2 * capWidth
```

Round to integer pixels (use `Math.ceil`) to avoid sub-pixel seam gaps.

### DOM Structure of a Marker

```html
<div class="label-marker" data-template="{name}">
  <div class="bubble" style="width:{totalWidth}px; height:{height}px;">
    <div class="cap left">{leftCapSvgInline}</div>
    <svg class="middle" width="{middleWidth}" height="{height}"
         viewBox="0 0 1 {height}" preserveAspectRatio="none">
      {middleInnerContent}
    </svg>
    <div class="cap right">{rightCapSvgInline}</div>
  </div>
  <div class="pointer" style="{computedPointerPosition}">{pointerSvgInline}</div>
  <span class="label-text" style="{computedTextPosition}">{text}</span>
</div>
```

CSS:
- `.label-marker` is `position: relative` with `pointer-events: none` on the root.
- `.bubble`, `.pointer`, `.label-text` are positioned within it.
- `.bubble` uses `display: flex` (row) to lay out the three pieces.
- The `<svg>` middle has `display: block` to avoid baseline gap.

### Pointer Positioning

Compute the pointer's CSS based on `attachEdge`, `attachFrom`, `attachOffset`, and `tipX`/`tipY`:

- For `attachEdge: 'bottom', attachFrom: 'left'`:
  - `left = attachOffset - tipX`
  - `top = height` (the bubble height; pointer hangs below)
- For `attachEdge: 'bottom', attachFrom: 'right'`:
  - `left = totalWidth - attachOffset - tipX`
  - `top = height`
- Implement analogous cases for `top`, `left`, `right` edges.
- The pointer SVG should overlap 1–2px into the bubble — this is baked into the SVG by the designer, but verify by shifting the pointer up/down/left/right by 1px toward the bubble in code if needed.

### Mapbox Marker Setup

Use `new mapboxgl.Marker({ element, anchor: 'top-left', offset: [-anchorX, -anchorY] })` so that the manifest's `anchorX`/`anchorY` coordinate within the marker DOM is what sits on the map coordinate. For a callout, this equals the pointer tip position in marker space.

### Theming

When `theme.bubbleFill` is provided, set inline CSS variables on the marker root:

```ts
markerEl.style.setProperty('--bubble-fill', theme.bubbleFill);
markerEl.style.setProperty('--text-color', theme.textColor);
markerEl.style.setProperty('--accent-fill', theme.accentFill);
```

The SVGs reference these via `fill="var(--bubble-fill, ...)"`.

### Hit Detection

This is critical because labels overlap interactive map features:

- The marker root has `pointer-events: none`.
- Only `.label-text` and `.bubble` have `pointer-events: auto`.
- The `.pointer` element has `pointer-events: none` (don't catch clicks on the tail).
- When `onClick` is provided, attach the listener to `.bubble` (which contains the text overlay area visually).
- Add 4px of invisible padding *inside* `.bubble` for touch targets if `onClick` is set — but only the visible bubble area should appear interactive (cursor: pointer on `.bubble` only when `onClick` is set).

This ensures clicks on transparent areas of the marker pass through to Mapbox layers below, and Mapbox's `map.on('click', layer, ...)` still fires for features adjacent to the label.

### Template Loading

```ts
async function loadTemplate(name: string): Promise<LoadedTemplate> {
  const base = `/label-templates/${name}`;
  const [manifest, leftCap, middle, rightCap, pointer] = await Promise.all([
    fetch(`${base}/manifest.json`).then(r => r.json()),
    fetch(`${base}/left-cap.svg`).then(r => r.text()),
    fetch(`${base}/middle.svg`).then(r => r.text()),
    fetch(`${base}/right-cap.svg`).then(r => r.text()),
    fetch(`${base}/pointer.svg`).then(r => r.text()),
  ]);
  // Parse middle.svg to extract its inner contents (everything inside the root <svg>)
  // so we can re-wrap with our own viewBox at render time.
  const middleInner = extractSvgInner(middle);
  return { manifest, leftCap, middleInner, rightCap, pointer };
}
```

Cache results in a `Map<string, LoadedTemplate>`. Error if a template referenced by `createLabel` hasn't been preloaded.

## Acceptance Criteria

1. Calling `createLabel` with text of any length produces a marker where the bubble width fits the text plus padding, with no visible seam between caps and middle.
2. The pointer's tip sits exactly on the supplied `lngLat` coordinate at all zoom levels.
3. Calling `setText` on a handle re-measures and updates the marker in place without removing/re-adding it from the map.
4. Calling `setTemplate` swaps the visual style while preserving the label's text and position.
5. Clicks on transparent areas around the label pass through to underlying Mapbox features (verify with a `map.on('click', symbolLayerId, ...)` test).
6. Clicks on the bubble fire the `onClick` callback and do **not** propagate to the map.
7. Adding 200 labels to the map and panning/zooming maintains 60 fps on a modern laptop.
8. Custom fonts referenced in a template manifest are loaded before any measurement happens — there is no visible "snap" when a font finishes loading after markers are placed.

## Project Setup

- Create the module under `src/labels/`.
- Export `LabelMarkerManager` from `src/labels/index.ts`.
- Add a demo page under `src/demo/labels.html` (or equivalent for the project's framework) that:
  - Loads 2–3 example templates.
  - Places ~20 labels at varied coordinates with varied text lengths.
  - Has buttons to swap themes and templates at runtime.
  - Logs `onClick` events to the console.
- Include 2 example templates in `/public/label-templates/`: a simple `pill` (no pointer — set `pointer.width: 0` and skip rendering) and a `callout-bottom` with a triangular pointer hanging from the bottom-left.

## What NOT to Do

- Do not compute a unified bubble+pointer outline path. The lazy overlap-with-matching-fill approach is intentional and is what the designer-facing format expects.
- Do not use `<img src="...">` for the SVG assets — inline them so CSS variables work.
- Do not put `pointer-events: auto` on the marker root. Hit detection is scoped to the visible bubble only.
- Do not use Mapbox symbol layers for these labels. They must be HTML markers because the visual styling and theming requirements exceed what symbol layers support.
