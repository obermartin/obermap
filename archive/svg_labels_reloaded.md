# Implementation Prompt: SVG Label Template System for Mapbox

## Context

I'm building a web app that uses **Mapbox GL JS** to render highly interactive maps with many labels and annotations placed on top of and adjacent to clickable map features. I want a flexible **label template system** where designers can drop in new SVG-based "container styles" (pill, callout bubble, notched tag, etc.) and the app uses them to render labels that automatically resize to fit dynamic text content.

There are **two kinds of labels**:

- **Highlight labels** — one line of text with a backplate and pointer.
- **Regular labels** — two lines of text, each with its own independent backplate. Primary backplate has a pointer; secondary backplate never does. The secondary sits above or below the primary.

**All text always sits inside a backplate.** Each backplate is built from the same four-piece SVG architecture (left cap + tileable middle + right cap, plus optional pointer for the primary). Primary and secondary lines have fully independent typography.

The pointer on the primary backplate has two flavors:
- **Connected** (default): the pointer visually fuses with the backplate, sharing its fill color, overlapping into the backplate edge. Classic callout look.
- **Disconnected**: the pointer is a separate visual element at the map coordinate (a dot, square, crosshair, etc.) with its own fill color, separated from the backplate by empty space. Selected via the manifest's `pointer.independentColor: true`.

Implement this as a self-contained module that can be imported and used from the rest of the app. Use **TypeScript**. Use **Mapbox GL JS v3+**.

## Architecture Overview

A **template** is a folder of static SVG assets plus a JSON manifest. Each label on the map is rendered by:

1. Loading the template (cached after first load).
2. Measuring the primary line's text width using the canvas API with the primary's typography settings.
3. If a secondary line exists and is non-empty, measuring it independently with its own typography.
4. Computing each backplate's width: `max(minWidth, textWidth + 2 * paddingX)`.
5. For each backplate, stretching its middle SVG to fit (`backplateWidth - 2 * capWidth`).
6. Assembling a Mapbox HTML marker DOM element containing: primary backplate, pointer attached to primary, and optionally a secondary backplate positioned above or below the primary.
7. Positioning the marker so that the primary pointer's tip lands exactly on the supplied `[lng, lat]` coordinate.

The backplates have **no outline/stroke** — only fills — so the connected-pointer seam is handled by overlapping the pointer 1–2px into the primary backplate with matching fill color. For disconnected pointers, there's no seam to hide because they're visually separated by design.

## Template Asset Format

Each template lives at `/public/label-templates/{template-name}/` with a flat file structure:

```
primary_left-cap.svg
primary_middle.svg
primary_right-cap.svg
primary_pointer.svg
secondary_left-cap.svg       (regular templates only)
secondary_middle.svg         (regular templates only)
secondary_right-cap.svg      (regular templates only)
manifest.json
```

Highlight templates have only the four `primary_*` files. Regular templates have all seven SVGs. **There is no `secondary_pointer.svg`** — secondary backplates never have pointers.

### Middle SVG Width — Important

Middle SVGs can be **any width**, not just 1px. The renderer reads each middle SVG's intrinsic dimensions (from its `viewBox` or `width`/`height` attributes) and stretches it horizontally to the runtime width using `preserveAspectRatio="none"`. Because designers create middles with horizontally-uniform content (solid fills, horizontal lines, vertical gradients only), the stretching produces no visual artifacts.

The renderer must extract the inner contents of each middle SVG and re-wrap them with `viewBox="0 0 {sourceWidth} {sourceHeight}"` and runtime `width="{stretchedWidth}"`, preserving the original coordinate system. Do not assume source viewBox starts at 0,0 or has any particular width.

### Manifest Schema

```ts
interface Typography {
  fontFamily: string;
  fontSize: number;             // px
  fontWeight: number;
  color: string;                // hex or CSS var(...) expression
  letterSpacing?: number;       // px; default 0
  lineHeight?: number | string; // multiplier (1.2) or px string ("18px"); default 1.2
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'; // default 'none'
  textAlign?: 'left' | 'center' | 'right'; // default 'center'
  maxWidth?: number;            // px; if set, wraps to multiple lines
}

interface Pointer {
  width: number;
  height: number;
  attachEdge: 'top' | 'bottom' | 'left' | 'right';
  attachFrom: 'left' | 'right' | 'top' | 'bottom';
  attachOffset: number;
  tipX: number;
  tipY: number;
  independentColor?: boolean;   // default false. When true, pointer uses --pointer-fill
                                // instead of inheriting --primary-backplate-fill.
}

interface PrimaryBackplate {
  height: number;
  capWidth: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  typography: Typography;
  pointer: Pointer;
}

interface SecondaryBackplate {
  height: number;
  capWidth: number;
  minWidth: number;
  paddingX: number;
  paddingY: number;
  typography: Typography;
  position: 'above' | 'below';
  align: 'left' | 'center' | 'right';
  gap: number;                  // px between visible edges of primary and secondary
                                // (accounts for pointer if pointer is on the facing edge)
}

interface TemplateManifest {
  name: string;
  kind: 'highlight' | 'regular';
  primary: PrimaryBackplate;
  secondary?: SecondaryBackplate;  // required iff kind === 'regular'
}
```

### Validation Rules

At template load time, throw descriptive errors if:

- `kind === 'highlight'` and `secondary` is present.
- `kind === 'regular'` and `secondary` is absent.
- Any of `primary_left-cap.svg`, `primary_middle.svg`, `primary_right-cap.svg`, `primary_pointer.svg` is missing.
- `kind === 'regular'` and any of `secondary_left-cap.svg`, `secondary_middle.svg`, `secondary_right-cap.svg` is missing.
- `secondary_pointer.svg` exists in the folder (hard error — secondary never has a pointer).
- Any required numeric manifest field is missing or non-positive.
- `secondary.position` is not `"above"` or `"below"`.
- `secondary.align` is not `"left"`, `"center"`, or `"right"`.

### SVG Asset Rules

- All three pieces of a backplate (caps + middle) share that backplate's `height`.
- Middle SVGs may have any width.
- SVGs use CSS custom properties for colors (`fill="var(--primary-backplate-fill, #ffffff)"`).
- Pointer SVGs use either `--primary-backplate-fill` (connected pointer) or `--pointer-fill` (independent pointer) depending on what the designer chose. The runtime does not parse or modify SVG fills; it only sets CSS variables on the marker root.
- Inline the SVGs into the DOM (don't use `<img src>`) so CSS variables work.

## Module API

```ts
class LabelMarkerManager {
  constructor(map: mapboxgl.Map);

  loadTemplates(names: string[]): Promise<void>;

  createLabel(opts: {
    id: string;
    lngLat: [number, number];
    text: string | { primary: string; secondary?: string };
    template: string;
    theme?: {
      primaryBackplateFill?: string;
      secondaryBackplateFill?: string;
      primaryTextColor?: string;
      secondaryTextColor?: string;
      pointerFill?: string;       // only takes effect if pointer.independentColor is true
      accentFill?: string;
    };
    onClick?: (id: string) => void;
  }): LabelHandle;

  remove(id: string): void;
  clear(): void;
}

interface LabelHandle {
  id: string;
  setText(text: string | { primary: string; secondary?: string }): void;
  setTemplate(name: string): void;
  setTheme(theme: Partial<Theme>): void;
  remove(): void;
}
```

Rules for the `text` parameter:

- Plain string → treated as `{ primary: text }`.
- For a `highlight` template, passing a `secondary` value throws a descriptive error.
- For a `regular` template, omitting `secondary` (or passing `""`) hides the secondary backplate entirely and recomputes marker height as if it weren't there.

## Implementation Requirements

### Text Measurement

- Single shared `OffscreenCanvas` (or hidden `<canvas>` fallback).
- Set canvas `font` shorthand from typography: `${weight} ${size}px ${family}`.
- For `letterSpacing`, manually add `letterSpacing * max(0, text.length - 1)` to measured width.
- For `textTransform`, transform the string before measuring (e.g. `text.toUpperCase()`).
- For `maxWidth`, implement word-wrap: split on spaces, build lines that fit `maxWidth`, return the widest line's width and the total line count.

### Font Loading

- In `loadTemplates`, after manifests are parsed, collect every unique `(fontFamily, fontWeight, fontSize)` triple across all loaded templates (both primary and secondary typography).
- For each, `await document.fonts.load(\`${weight} ${size}px ${family}\`)`.
- Only resolve `loadTemplates` once all fonts are confirmed loaded.

### Width & Height Computation

```
primaryTextWidth = measureWithLetterSpacing(primaryText, primary.typography)
primaryWidth = max(primary.minWidth, primaryTextWidth + 2 * primary.paddingX)
primaryMiddleStretched = primaryWidth - 2 * primary.capWidth

If secondary present and visible (non-empty text):
  secondaryTextWidth = measureWithLetterSpacing(secondaryText, secondary.typography)
  secondaryWidth = max(secondary.minWidth, secondaryTextWidth + 2 * secondary.paddingX)
  secondaryMiddleStretched = secondaryWidth - 2 * secondary.capWidth

pointerOverhang = pointer.height  (vertical extent outside the primary backplate)

markerHeight =
  (secondary visible && position === 'above' ? secondary.height + gap : 0) +
  (pointer.attachEdge === 'top' ? pointerOverhang : 0) +
  primary.height +
  (pointer.attachEdge === 'bottom' ? pointerOverhang : 0) +
  (secondary visible && position === 'below' ? gap + secondary.height : 0)

markerWidth = max(primaryWidth, secondaryWidth if visible, ...horizontal pointer overhang)
```

Use `Math.ceil` on widths to integer pixels (avoids sub-pixel seam gaps).

**Gap accounting for pointer:** `secondary.gap` is the visible distance between backplates. If `pointer.attachEdge === 'top'` (pointer extends upward from primary) and `secondary.position === 'above'`, the pointer sits between the two backplates — gap is measured from the pointer's outer tip to the secondary's bottom edge. Same logic mirrored for `attachEdge === 'bottom'` with `position === 'below'`. For non-facing combinations, gap is just primary-to-secondary edge distance with no pointer interfering.

### Middle SVG Stretching

```ts
const { sourceWidth, sourceHeight } = parseMiddleSourceDimensions(middleSvgText);
const middleInner = extractSvgInner(middleSvgText);

// Render as:
<svg
  width={stretchedWidth}
  height={sourceHeight}
  viewBox={`0 0 ${sourceWidth} ${sourceHeight}`}
  preserveAspectRatio="none"
  style="display: block"
>
  {middleInner}
</svg>
```

Apply to both primary and secondary backplate middles.

### DOM Structure

```html
<div class="label-marker" data-template="{name}" data-kind="{kind}">

  <!-- Secondary backplate (if regular & visible & position === 'above') -->
  <div class="backplate secondary" style="...horizontal align positioning...">
    <div class="cap left">{secondaryLeftCapInline}</div>
    <svg class="middle">{secondaryMiddleInner}</svg>
    <div class="cap right">{secondaryRightCapInline}</div>
    <span class="text" style="...secondary typography...">{secondaryText}</span>
  </div>

  <!-- Primary backplate -->
  <div class="backplate primary" style="width:{primaryWidth}px; height:{primary.height}px;">
    <div class="cap left">{primaryLeftCapInline}</div>
    <svg class="middle">{primaryMiddleInner}</svg>
    <div class="cap right">{primaryRightCapInline}</div>
    <span class="text" style="...primary typography...">{primaryText}</span>
  </div>

  <!-- Pointer (always attached to primary) -->
  <div class="pointer" data-independent-color="{true|false}" style="...">{pointerSvgInline}</div>

  <!-- Secondary backplate (if regular & visible & position === 'below') -->
  <!-- same structure as above -->

</div>
```

Apply typography as inline styles on each `.text` element.

CSS rules:
- `.label-marker` is `position: relative`, `pointer-events: none`.
- `.backplate` uses `display: flex` (row) for its three SVG pieces. `position: relative` so `.text` can absolute-position over it.
- `.backplate .text` is `position: absolute; inset: 0;` with flex centering and typography styles.
- `.backplate.secondary` is `position: absolute` within the marker root, positioned per `align`.
- Pointer is `position: absolute`, positioned relative to the primary backplate's bounding box within the marker.
- All SVGs have `display: block`.

### Pointer Color Theming

Set CSS variables on the marker root:

```ts
if (theme.primaryBackplateFill)   el.style.setProperty('--primary-backplate-fill', theme.primaryBackplateFill);
if (theme.secondaryBackplateFill) el.style.setProperty('--secondary-backplate-fill', theme.secondaryBackplateFill);
if (theme.primaryTextColor)       el.style.setProperty('--primary-text-color', theme.primaryTextColor);
if (theme.secondaryTextColor)     el.style.setProperty('--secondary-text-color', theme.secondaryTextColor);
if (theme.accentFill)             el.style.setProperty('--accent-fill', theme.accentFill);

// Pointer color only takes effect if the pointer SVG uses --pointer-fill.
// Designers signal this via manifest's pointer.independentColor flag, and
// they're expected to author the pointer SVG to use the matching variable.
if (theme.pointerFill)            el.style.setProperty('--pointer-fill', theme.pointerFill);
```

The runtime does not modify SVG fill attributes. It only sets CSS variables. Whether the pointer is "connected" or "disconnected" in fill terms is purely a function of which CSS variable the designer used in their pointer SVG — `--primary-backplate-fill` for connected, `--pointer-fill` for independent. The `independentColor` flag on the manifest is primarily informational/documentary; the renderer can set `--pointer-fill` to a sensible default (e.g. fall back to `--primary-backplate-fill` if no pointerFill theme value is supplied, ensuring connected pointers always work).

To make this robust, set this fallback chain on the marker root:

```css
.label-marker {
  --pointer-fill: var(--primary-backplate-fill, #ffffff);
}
```

Then when `theme.pointerFill` is explicitly provided, it overrides. This means:
- Designer uses `--primary-backplate-fill` in pointer SVG → pointer always matches backplate, even if `pointerFill` theme is set.
- Designer uses `--pointer-fill` in pointer SVG → pointer defaults to backplate color but can be themed independently.

The `independentColor` flag in the manifest doesn't gate anything in the renderer — it documents designer intent for tooling and downstream code that may want to expose pointer-color UI conditionally. The renderer always sets both variables and the SVG's CSS-var reference determines the result.

### Secondary Horizontal Alignment

The secondary backplate aligns to the primary based on `secondary.align`:

- `"left"` — secondary's left edge aligns with primary's left edge.
- `"center"` — secondary's horizontal center aligns with primary's horizontal center.
- `"right"` — secondary's right edge aligns with primary's right edge.

If secondary is wider than primary, it overhangs in the direction(s) opposite the alignment edge. For `center`, it overhangs equally. The marker's bounding box grows to encompass the overhang — this matters for hit detection and Mapbox's positioning.

### Pointer Positioning

The pointer is positioned relative to the primary backplate's bounding box within the marker. The primary may be offset vertically within the marker if there's a secondary above it.

For `attachEdge: 'bottom', attachFrom: 'left'`:
- `pointer.left = primaryLeftInMarker + (attachOffset - tipX)`
- `pointer.top = primaryTopInMarker + primary.height`

Implement all four edges with both `attachFrom` options.

For disconnected pointers, the positioning math is identical — the `attachOffset` still measures where in the primary's edge the pointer's anchor is, and `tipX`/`tipY` still locate the tip within the pointer SVG. Visual separation is achieved by the designer drawing the pointer SVG such that the tip is at the bottom of the SVG (for `attachEdge: 'bottom'`) with empty space above it, so even though the pointer's bounding box touches the backplate, the visible content is separated.

### Mapbox Marker Setup

```ts
new mapboxgl.Marker({
  element,
  anchor: 'top-left',
  offset: [-pointerTipMarkerX, -pointerTipMarkerY]
})
```

Where `pointerTipMarkerX`/`pointerTipMarkerY` are the pointer tip's coordinates in marker space — computed from primary's offset within the marker plus the pointer's position relative to primary plus `tipX`/`tipY` within the pointer SVG.

### Hit Detection

- `.label-marker` has `pointer-events: none`.
- `.backplate.primary` has `pointer-events: auto`.
- `.backplate.secondary` has `pointer-events: none`.
- `.pointer` has `pointer-events: none`.

When `onClick` is provided, attach the listener to `.backplate.primary` and set `cursor: pointer` on it.

### Template Loading

```ts
async function loadTemplate(name: string): Promise<LoadedTemplate> {
  const base = `/label-templates/${name}`;
  const manifest = await fetch(`${base}/manifest.json`).then(r => r.json());
  validateManifest(manifest);

  const required = [
    'primary_left-cap.svg',
    'primary_middle.svg',
    'primary_right-cap.svg',
    'primary_pointer.svg',
  ];
  if (manifest.kind === 'regular') {
    required.push('secondary_left-cap.svg', 'secondary_middle.svg', 'secondary_right-cap.svg');
  }

  const fetched = await Promise.all(
    required.map(f => fetch(`${base}/${f}`).then(r => {
      if (!r.ok) throw new Error(`Missing required asset: ${f}`);
      return r.text();
    }))
  );

  // Hard error if a stray secondary_pointer.svg exists.
  const stray = await fetch(`${base}/secondary_pointer.svg`);
  if (stray.ok) {
    throw new Error(
      `Template "${name}" contains secondary_pointer.svg. Secondary backplates never have pointers.`
    );
  }

  return { manifest, ...mapFilesToLoadedTemplate(required, fetched) };
}
```

Cache results in a `Map<string, LoadedTemplate>`.

## Acceptance Criteria

1. A `highlight` template renders correctly at any primary text length, with no visible seam between caps and middle and the pointer tip exactly on the lng/lat.
2. A `regular` template renders both backplates independently sized to their respective text content.
3. Each text line uses its own typography settings.
4. Secondary `position: 'above'` and `'below'` both work correctly, with the pointer correctly between them (or not) based on `pointer.attachEdge`.
5. Secondary `align: 'left' | 'center' | 'right'` correctly positions the secondary backplate horizontally.
6. Middle SVGs of any source width render correctly.
7. Calling `setText` updates the marker in place. Empty secondary text hides the entire secondary backplate.
8. Calling `setTemplate` swaps the visual style, preserving text and lngLat.
9. The primary pointer's tip sits exactly on the supplied `lngLat` at all zoom levels.
10. **A template authored with a "connected" pointer (SVG referencing `--primary-backplate-fill`) shows the pointer in the same color as the backplate. A template authored with an "independent" pointer (SVG referencing `--pointer-fill`) shows the pointer in a separately themeable color, defaulting to the backplate color if no `pointerFill` theme value is provided.**
11. Custom fonts are loaded before any text measurement.
12. Clicks on transparent areas, on the secondary backplate, and on the pointer all pass through to underlying Mapbox features.
13. Clicks on the primary backplate fire `onClick`.
14. 200 labels on the map maintain 60 fps during pan/zoom.
15. Invalid manifests, missing required SVG files, and the presence of `secondary_pointer.svg` all throw descriptive errors at load time.

## Project Setup

- Module under `src/labels/`. Export `LabelMarkerManager` from `src/labels/index.ts`.
- Demo page at `src/demo/labels.html` (or equivalent) that:
  - Loads 5 example templates:
    1. `highlight-pill` — highlight, connected pointer.
    2. `highlight-dot-mark` — highlight, disconnected pointer (a colored dot or crosshair).
    3. `regular-below-center` — regular, secondary below primary, center-aligned, connected pointer.
    4. `regular-above-left` — regular, secondary above primary, left-aligned, connected pointer.
    5. `regular-disconnected-pointer` — regular, disconnected pointer with `pointerFill` theme set to a contrasting color.
  - Places ~20 labels with varied coordinates and text.
  - Buttons to swap themes (including pointer-fill independently of backplate-fill).
  - Buttons to mutate primary and secondary text.
  - Buttons to swap one template for another on the same marker.
  - Logs `onClick` events.
- Include all 5 example templates in `/public/label-templates/`.

## What NOT to Do

- Do not use Lottie or any animation runtime — static SVG only.
- Do not allow a pointer on the secondary backplate. Throw at load time if `secondary_pointer.svg` exists.
- Do not compute a unified outline path for primary + pointer.
- Do not modify SVG fill attributes at runtime. Theming is purely CSS-variable-based.
- Do not use `<img src="...">` for SVG assets — inline them.
- Do not assume middle SVGs are 1px wide.
- Do not put `pointer-events: auto` on the marker root, secondary backplate, or pointer.
- Do not let the secondary backplate's width or position affect the primary or the pointer.
- Do not use Mapbox symbol layers.
