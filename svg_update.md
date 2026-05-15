# Update Prompt: Refinements to the SVG Label Template System

## Context

This is a follow-up to an already-implemented label template system for Mapbox GL JS (the `LabelMarkerManager` module, templates loaded from `/public/label-templates/{name}/`, with primary/secondary backplates built from `primary_*.svg` and `secondary_*.svg` files). Two refinements are needed based on real-world testing with designer-produced assets. Do not refactor unrelated code; just apply the two changes below where they belong.

---

## Update 1 — Normalize Illustrator-style class-based fills at SVG load time

### Problem

Illustrator's default SVG export uses class-based fills inside `<style>` blocks:

```xml
<svg viewBox="0 0 100 20">
  <defs>
    <style>
      .cls-1 { fill: #ffffff; }
    </style>
  </defs>
  <rect class="cls-1" width="100" height="20"/>
</svg>
```

When the renderer inlines multiple such SVGs into the same DOM (primary cap + middle + right cap + pointer, plus secondary trio), all the `<style>` blocks end up in the same document. The `.cls-1` selector from each file matches elements in every other file. CSS specificity is identical, so the last-parsed rule wins for all matched elements — meaning fills bleed across SVGs and some shapes render with the wrong color or appear unfilled.

This also defeats CSS-variable-based theming: hardcoded fills in `<style>` blocks override any `--primary-backplate-fill` variable set on the marker root.

### Fix

When loading each SVG asset (in `loadTemplate` or wherever raw SVG text is parsed), normalize the SVG before storing it:

1. Parse the SVG with `DOMParser`.
2. Collect all `<style>` elements inside the SVG and parse their CSS rules into a `{ selector: { property: value } }` map. Only handle the simple `.className { ... }` pattern — that's all Illustrator produces.
3. Walk every element under the `<svg>` root. For each element with a `class` attribute, look up matching rules and copy fill/stroke/opacity/stroke-width properties directly onto the element as attributes — but only if the element doesn't already have an inline override for that property.
4. Remove the `class` attribute from every element after applying.
5. Delete all `<style>` blocks and any `<defs>` wrappers that become empty as a result.
6. Optionally rewrite hardcoded fills to use CSS variables: replace `fill="#ffffff"` (or whatever) with `fill="var(--primary-backplate-fill, #ffffff)"` so theming works. Apply the matching variable per file:
   - `primary_left-cap.svg`, `primary_middle.svg`, `primary_right-cap.svg` → `--primary-backplate-fill`
   - `primary_pointer.svg` → `--primary-backplate-fill` by default, OR `--pointer-fill` if the manifest has `primary.pointer.independentColor === true`
   - `secondary_left-cap.svg`, `secondary_middle.svg`, `secondary_right-cap.svg` → `--secondary-backplate-fill`
7. Serialize the normalized SVG back to a string. This is what gets inlined into markers at render time.

Step 6 is the part that makes designer-provided SVGs themeable without requiring designers to manually write CSS variable references in their source files. It's safe because the variables include a fallback to the original color, so SVGs render correctly even outside the label system.

### Why not just keep `<style>` blocks scoped

You might be tempted to scope the styles by prefixing class names with a unique ID per SVG. That works but means producing inline `<style>` blocks inside every rendered marker, which is heavier than just baking the fills onto the elements. The normalize-once-at-load approach is cleaner.

### Validation addition

At template load time, after normalization, log a warning (don't throw) if any SVG still contains a `<style>` block — this means the parser found syntax it couldn't handle and the SVG might render incorrectly. Useful for catching edge cases.

---

## Update 2 — Graceful rendering when a backplate is narrower than `2 × capWidth`

### Problem

The original spec implicitly assumed `minWidth >= 2 * capWidth` so the stretched middle width is always positive. In practice, designers want to make small tight backplates (think dot badges, near-circular pills) where the two caps butt against each other or even overlap, with no visible middle. The current spec would either render a 0px or negative-width middle SVG (browser-dependent rendering, usually invisible but sometimes weird) and let the two caps overflow the wrapper.

### Fix

In the backplate render path, replace the cap-width and middle-width computation with the clamping version:

```ts
// Before:
//   const middleStretched = totalWidth - 2 * capWidth;
// After:
const effectiveCapWidth = Math.min(capWidth, totalWidth / 2);
const middleStretched = Math.max(0, totalWidth - 2 * effectiveCapWidth);
```

Then:

- Render each cap at `effectiveCapWidth` (which equals `capWidth` for normal cases, less for tight ones).
- Only render the middle SVG element if `middleStretched > 0`. Skip it entirely otherwise; the two caps butt against each other and form the whole backplate.

The cap container elements should also get `flex-shrink: 0` to ensure they don't get squeezed by flex layout when content exceeds the wrapper width during transient renders.

Apply this same logic to both the primary and secondary backplates.

### Validation update

If the validation layer currently rejects manifests where `minWidth < 2 * capWidth`, remove that rule. It's not a real constraint.

Also remove (or downgrade to a warning) any check that asserts `pointer.tipX <= pointer.width` or `pointer.tipY <= pointer.height`. Designers occasionally draw pointers with the tip anchor outside the SVG bounding box (e.g. for an offset effect), and the math works fine either way.

---

## Acceptance Criteria for This Update

1. An Illustrator-default SVG export (using `<defs><style>.cls-1 { fill: ... }</style></defs>` with `<rect class="cls-1">`) renders correctly when used as any of the seven possible template SVG roles.
2. Two templates whose SVGs both reference `.cls-1` (or any other shared class name) but with different fills can be used on the map simultaneously without color bleed between them.
3. The same SVG renders with a different fill when the marker's `--primary-backplate-fill` (or relevant variable) is overridden via theme, even though the designer's source file had a hardcoded fill.
4. A template with `primary.minWidth: 24` and `primary.capWidth: 16` renders correctly: at the minimum width, each cap is clamped to 12px wide, no middle SVG is rendered, and the two caps butt together.
5. A template with `primary.minWidth: 32` and `primary.capWidth: 16` renders normally: caps are full 16px each, no middle visible at minWidth (since `32 - 32 = 0`), and as text grows the middle appears and stretches.
6. The previously-rejected manifests (with `minWidth < 2 * capWidth`) now load without error.
7. Existing templates that worked before this update continue to render identically — none of the existing geometry should shift.

## What Not to Change

- The manifest schema is unchanged. No new fields.
- The file structure is unchanged.
- The module API (`LabelMarkerManager`, `createLabel`, `setText`, etc.) is unchanged.
- Hit detection, theming, font loading, pointer positioning, secondary alignment — all unchanged.
- The demo page is unchanged unless you need to add a test case demonstrating the small-backplate or Illustrator-fill behavior.
