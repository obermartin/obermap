// building-select-v2.js
// Robust single-building click-selection for MapLibre fill-extrusion layers.
//
// v2 changes (fixes "selects the whole neighborhood" + "flat 2D outline"):
//
//   1. Part detection now requires INTERIOR OVERLAP, not mere touching.
//      Each candidate is shrunk by ~5 cm before testing. Buildings that
//      share a party wall (Berlin perimeter blocks, rowhouses) no longer
//      chain together, and the degenerate slivers created by tile-boundary
//      clipping collapse to nothing when shrunk, so tile edges can no
//      longer act as false "shared walls".
//   2. Elevated parts (render_min_height > 0.5 m, e.g. towers, bridges,
//      cantilevers) may additionally join via plain touching — they must
//      be sitting on something, so this is safe.
//   3. Hard cap on selection size as a safety net.
//   4. Overlay renderer hardened: coerces heights to numbers, tries
//      several property names, and is explicitly fill-extrusion. DO NOT
//      convert the highlight layer to 'fill' or 'line'.
//
// Trade-off to know about: OSM maps some multi-part buildings as
// side-by-side polygons that only share an edge (e.g. church nave +
// tower as separate ground-level parts). Those are geometrically
// indistinguishable from two neighboring houses, so v2 will treat them
// as separate buildings. Overlapping/stacked parts (tower on podium,
// setbacks) are detected correctly.
//
// Usage:
//   import { BuildingSelector } from './building-select-v2.js';
//   const selector = new BuildingSelector(map, { debug: true });
//
// Dependencies: maplibre-gl, @turf/turf

import * as turf from '@turf/turf';

const HL_SOURCE = 'bsel-highlight';
const HL_LAYER = 'bsel-highlight-3d';

export class BuildingSelector {
  constructor(map, opts = {}) {
    this.map = map;
    this.highlightColor = opts.highlightColor ?? '#ff6a00';
    this.mode = opts.mode ?? 'auto';              // 'auto' | 'feature-state' | 'overlay'
    this.expandToParts = opts.expandToParts ?? true;
    this.shrinkM = opts.shrinkM ?? 0.05;          // candidate shrink before overlap test
    this.searchRadiusM = opts.searchRadiusM ?? 150;
    this.maxFeatures = opts.maxFeatures ?? 80;    // hard cap, safety net
    this.overlayGrowM = opts.overlayGrowM ?? 0.35;
    this.layerIds = opts.layerIds ?? null;        // null = autodetect fill-extrusion layers
    this.onSelect = opts.onSelect ?? null;
    this.debug = opts.debug ?? false;

    this._selection = null;
    this._wrapped = new Map();

    this._onClick = this._onClick.bind(this);
    this._onStyleData = this._onStyleData.bind(this);
    map.on('click', this._onClick);
    map.on('styledata', this._onStyleData);
    if (map.isStyleLoaded()) this._prepareStyle();
  }

  destroy() {
    this.clear();
    this.map.off('click', this._onClick);
    this.map.off('styledata', this._onStyleData);
  }

  // ---------------------------------------------------------------- style

  _extrusionLayerIds() {
    if (this.layerIds) return this.layerIds.filter(id => this.map.getLayer(id));
    return this.map.getStyle().layers
      .filter(l => l.type === 'fill-extrusion' && l.id !== HL_LAYER)
      .map(l => l.id);
  }

  _onStyleData() { this._prepareStyle(); }

  _prepareStyle() {
    if (!this.map.isStyleLoaded()) return;
    for (const id of this._extrusionLayerIds()) this._wrapColor(id);
    if (this._selection) this._applySelection(this._selection);
  }

  _wrapColor(layerId) {
    const cur = this.map.getPaintProperty(layerId, 'fill-extrusion-color') ?? '#aaaaaa';
    if (Array.isArray(cur) && JSON.stringify(cur).includes('"bselSelected"')) return;
    this._wrapped.set(layerId, cur);
    this.map.setPaintProperty(layerId, 'fill-extrusion-color', [
      'case',
      ['boolean', ['coalesce', ['feature-state', 'bselSelected'], false], false],
      this.highlightColor,
      cur,
    ]);
  }

  // ---------------------------------------------------------------- click

  _onClick(e) {
    const layers = this._extrusionLayerIds();
    if (!layers.length) return;

    // Exact point, extrusion layers ONLY, no bbox tolerance.
    const hits = this.map.queryRenderedFeatures(e.point, { layers });
    if (!hits.length) { this.clear(); return; }

    const seed = hits[0];
    if (this.debug) {
      console.log('[bsel] seed id:', seed.id, 'props:', seed.properties);
    }

    const sel = this._collectBuilding(seed);
    if (this.debug) {
      console.log(`[bsel] selected ${sel.features.length} feature(s), ids:`, sel.ids);
    }
    this.clear();
    this._selection = sel;
    this._applySelection(sel);
    this.onSelect?.(sel);
  }

  // ---------------------------------------------------------- collection

  _minHeight(f) {
    return Number(f.properties?.render_min_height ?? f.properties?.min_height ?? 0) || 0;
  }

  _height(f) {
    const h = Number(
      f.properties?.render_height ?? f.properties?.height ?? f.properties?.h
    );
    return Number.isFinite(h) && h > 0 ? h : 3;
  }

  // Shrink a footprint slightly; returns null for degenerate slivers
  // (this is what neutralizes tile-clip edge artifacts).
  _shrunk(f) {
    try {
      const g = turf.buffer(f, -this.shrinkM, { units: 'meters' });
      if (!g || !g.geometry || !g.geometry.coordinates?.length) return null;
      return g;
    } catch { return null; }
  }

  _collectBuilding(seed) {
    const source = seed.source;
    const sourceLayer = seed.sourceLayer;
    const hasIds = seed.id !== undefined;

    let candidates = this.map
      .querySourceFeatures(source, { sourceLayer })
      .filter(f => f.geometry &&
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));

    let seedCenter = null;
    try { seedCenter = turf.center(seed); } catch {}
    if (seedCenter) {
      candidates = candidates.filter(f => {
        try {
          return turf.distance(seedCenter, turf.center(f), { units: 'meters' })
            < this.searchRadiusM;
        } catch { return false; }
      });
    }

    const selectedIds = new Set();
    const selectedFeatures = [];
    const take = (f) => {
      if (f.id !== undefined) selectedIds.add(f.id);
      selectedFeatures.push(f);
    };

    // Seed group: every tile copy sharing the seed's id.
    let frontier = [];
    if (hasIds) {
      for (const f of candidates) {
        if (f.id === seed.id) { take(f); frontier.push(f); }
      }
      if (!frontier.length) { take(seed); frontier = [seed]; }
    } else {
      take(seed); frontier = [seed];
    }

    if (this.expandToParts) {
      let remaining = candidates.filter(f => !(hasIds && selectedIds.has(f.id)));

      while (frontier.length && selectedFeatures.length < this.maxFeatures) {
        const next = [];
        for (const f of frontier) {
          if (selectedFeatures.length >= this.maxFeatures) break;
          remaining = remaining.filter(c => {
            if (hasIds && selectedIds.has(c.id)) return false;
            if (selectedFeatures.length >= this.maxFeatures) return true;

            let join = false;

            // Rule A: interiors overlap (stacked/overlapping parts).
            // Shared party walls do NOT pass this test.
            const cShrunk = this._shrunk(c);
            if (cShrunk) {
              try { join = turf.booleanIntersects(f, cShrunk); } catch {}
            }

            // Rule B: elevated parts (base > 0.5 m) may join by touching —
            // they have to rest on something below them.
            if (!join && this._minHeight(c) > 0.5) {
              try { join = turf.booleanIntersects(f, c); } catch {}
            }

            if (join) { take(c); next.push(c); return false; }
            return true;
          });
        }
        frontier = next;
      }
    }

    return { source, sourceLayer, ids: [...selectedIds], features: selectedFeatures, hasIds };
  }

  // ---------------------------------------------------------------- render

  _applySelection(sel) {
    const useFeatureState =
      this.mode === 'feature-state' || (this.mode === 'auto' && sel.hasIds);
    if (useFeatureState) {
      for (const id of sel.ids) {
        this.map.setFeatureState(
          { source: sel.source, sourceLayer: sel.sourceLayer, id },
          { bselSelected: true }
        );
      }
    } else {
      this._renderOverlay(sel);
    }
  }

  // IMPORTANT: the highlight layer is a fill-extrusion. Rendering it as
  // 'fill' or 'line' produces a flat 2D footprint on the ground plane.
  _renderOverlay(sel) {
    const feats = [];
    for (const f of sel.features) {
      let g;
      try { g = turf.buffer(f, this.overlayGrowM, { units: 'meters' }); } catch { continue; }
      if (!g) continue;
      g.properties = { h: this._height(f) + 1, b: this._minHeight(f) };
      feats.push(g);
    }
    const data = { type: 'FeatureCollection', features: feats };

    if (!this.map.getSource(HL_SOURCE)) {
      this.map.addSource(HL_SOURCE, { type: 'geojson', data });
    } else {
      this.map.getSource(HL_SOURCE).setData(data);
    }
    if (!this.map.getLayer(HL_LAYER)) {
      this.map.addLayer({
        id: HL_LAYER,
        type: 'fill-extrusion',                    // <- must stay fill-extrusion
        source: HL_SOURCE,
        paint: {
          'fill-extrusion-color': this.highlightColor,
          'fill-extrusion-height': ['get', 'h'],   // numeric, metres
          'fill-extrusion-base': ['get', 'b'],
          'fill-extrusion-opacity': 0.95,
        },
      });
    }
  }

  clear() {
    if (this._selection) {
      const { source, sourceLayer, ids } = this._selection;
      if (this.map.getSource(source)) {
        for (const id of ids) {
          try {
            this.map.setFeatureState({ source, sourceLayer, id }, { bselSelected: false });
          } catch {}
        }
      }
      this._selection = null;
    }
    const src = this.map.getSource(HL_SOURCE);
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
    this.onSelect?.(null);
  }
}
