// building-select-v3.js
// Robust single-building click-selection for MapLibre fill-extrusion layers.
//
// v3 changes (fixes "low-rise buildings select everything nearby"):
//
//   1. AREA-THRESHOLD overlap test. Vector tile geometry is quantized to a
//      4096 grid (~0.6 m per unit at z14, coarser below). Adjacent rowhouses
//      snap into slight mutual overlaps, which defeated v2's shrink test.
//      v3 computes the actual intersection area and only joins parts whose
//      overlap is substantial (>= 3 m^2 or >= 4% of the smaller footprint).
//      Quantization slivers are long and paper-thin -> excluded. Genuinely
//      stacked building parts overlap massively -> included.
//   2. ZOOM GUARD. OpenMapTiles-schema tiles merge small buildings into
//      blocks at z13. Below z14 the tile itself ships one MultiPolygon per
//      block and no client logic can split it. v3 warns and disables part
//      expansion below minSelectZoom (default 14).
//   3. SELF-HEALING highlight layer: if a layer with the highlight id exists
//      but is not fill-extrusion (e.g. an agent "simplified" it to fill/line),
//      it is removed and recreated correctly.
//   4. debug: true logs zoom, seed id, geometry type/ring count, and every
//      join/reject decision with its overlap area.
//
// Usage:
//   import { BuildingSelector } from './building-select-v3.js';
//   const selector = new BuildingSelector(map, { debug: true });
//
// Dependencies: maplibre-gl, @turf/turf (v6 or v7)

import * as turf from '@turf/turf';

const HL_SOURCE = 'bsel-highlight';
const HL_LAYER = 'bsel-highlight-3d';

export class BuildingSelector {
  constructor(map, opts = {}) {
    this.map = map;
    this.highlightColor = opts.highlightColor ?? '#ff6a00';
    this.mode = opts.mode ?? 'auto';               // 'auto' | 'feature-state' | 'overlay'
    this.expandToParts = opts.expandToParts ?? true;
    this.minOverlapM2 = opts.minOverlapM2 ?? 3;    // absolute floor, m^2
    this.minOverlapRatio = opts.minOverlapRatio ?? 0.04; // of smaller footprint
    this.searchRadiusM = opts.searchRadiusM ?? 150;
    this.maxFeatures = opts.maxFeatures ?? 80;
    this.minSelectZoom = opts.minSelectZoom ?? 14; // buildings merge below z14
    this.overlayGrowM = opts.overlayGrowM ?? 0.35;
    this.layerIds = opts.layerIds ?? null;
    this.onSelect = opts.onSelect ?? null;
    this.debug = opts.debug ?? false;

    this._selection = null;

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

    const hits = this.map.queryRenderedFeatures(e.point, { layers });
    if (!hits.length) { this.clear(); return; }

    const seed = hits[0];
    const zoom = this.map.getZoom();

    if (this.debug) {
      const rings = seed.geometry.type === 'MultiPolygon'
        ? seed.geometry.coordinates.length
        : 1;
      console.log(
        `[bsel] zoom=${zoom.toFixed(2)} id=${String(seed.id)} ` +
        `geom=${seed.geometry.type} polys=${rings}`, seed.properties
      );
      if (rings > 3) {
        console.warn(
          '[bsel] Seed is a MultiPolygon with many parts — this is likely a ' +
          'tile-side merged building block (z13 aggregation). Zoom in to ' +
          'z>=14 for individual buildings.'
        );
      }
    }

    const sel = this._collectBuilding(seed, zoom);
    if (this.debug) {
      console.log(`[bsel] selected ${sel.features.length} feature(s), ids:`, sel.ids);
    }
    this.clear();
    this._selection = sel;
    this._applySelection(sel);
    this.onSelect?.(sel);
  }

  // ---------------------------------------------------------- geometry

  _minHeight(f) {
    return Number(f.properties?.render_min_height ?? f.properties?.min_height ?? 0) || 0;
  }

  _height(f) {
    const h = Number(
      f.properties?.render_height ?? f.properties?.height ?? f.properties?.h
    );
    return Number.isFinite(h) && h > 0 ? h : 3;
  }

  _area(f) {
    try { return turf.area(f); } catch { return 0; }
  }

  // turf v7 wants a FeatureCollection, v6 wants two args.
  _intersection(a, b) {
    try { return turf.intersect(turf.featureCollection([a, b])); } catch {}
    try { return turf.intersect(a, b); } catch {}
    return null;
  }

  // Substantial interior overlap? Quantization slivers between snapped
  // neighbors are paper-thin; real stacked parts overlap by whole rooms.
  _overlapsEnough(a, b, areaA, areaB) {
    const inter = this._intersection(a, b);
    if (!inter) return { join: false, area: 0 };
    const ia = this._area(inter);
    const threshold = Math.max(
      this.minOverlapM2,
      this.minOverlapRatio * Math.min(areaA, areaB)
    );
    return { join: ia >= threshold, area: ia };
  }

  _collectBuilding(seed, zoom) {
    const source = seed.source;
    const sourceLayer = seed.sourceLayer;
    const hasIds = seed.id !== undefined;

    const selectedIds = new Set();
    const selectedFeatures = [];
    const take = (f) => {
      if (f.id !== undefined) selectedIds.add(f.id);
      selectedFeatures.push(f);
    };

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

    // Seed group: all tile copies sharing the seed's id.
    let frontier = [];
    if (hasIds) {
      for (const f of candidates) {
        if (f.id === seed.id) { take(f); frontier.push(f); }
      }
      if (!frontier.length) { take(seed); frontier = [seed]; }
    } else {
      take(seed); frontier = [seed];
    }

    // Below minSelectZoom, tiles ship merged building blocks; part
    // expansion would only compound the problem.
    const expand = this.expandToParts && zoom >= this.minSelectZoom;
    if (this.expandToParts && !expand && this.debug) {
      console.warn(`[bsel] zoom < ${this.minSelectZoom}: part expansion disabled ` +
        '(tiles merge small buildings into blocks at low zoom).');
    }

    if (expand) {
      const areaCache = new Map();
      const areaOf = (f) => {
        if (!areaCache.has(f)) areaCache.set(f, this._area(f));
        return areaCache.get(f);
      };

      let remaining = candidates.filter(f => !(hasIds && selectedIds.has(f.id)));

      while (frontier.length && selectedFeatures.length < this.maxFeatures) {
        const next = [];
        for (const f of frontier) {
          if (selectedFeatures.length >= this.maxFeatures) break;
          const areaF = areaOf(f);
          remaining = remaining.filter(c => {
            if (hasIds && selectedIds.has(c.id)) return false;
            if (selectedFeatures.length >= this.maxFeatures) return true;

            let join = false;
            let why = '';

            // Rule A: substantial interior overlap (stacked/overlapping parts).
            const res = this._overlapsEnough(f, c, areaF, areaOf(c));
            if (res.join) { join = true; why = `overlap ${res.area.toFixed(1)} m²`; }

            // Rule B: elevated parts (base > 0.5 m) join by touching —
            // they must rest on something below them.
            if (!join && this._minHeight(c) > 0.5) {
              try {
                if (turf.booleanIntersects(f, c)) { join = true; why = 'elevated+touching'; }
              } catch {}
            }

            if (this.debug && (join || res.area > 0)) {
              console.log(`[bsel]   candidate id=${String(c.id)} ` +
                `${join ? 'JOIN' : 'reject'} (${why || `overlap ${res.area.toFixed(2)} m²`})`);
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

    // Self-heal: if something replaced our layer with a non-extrusion type
    // (a flat fill/line produces exactly a "2D outline on the ground"),
    // remove it and recreate the correct one.
    const existing = this.map.getLayer(HL_LAYER);
    if (existing && existing.type !== 'fill-extrusion') {
      console.warn(`[bsel] highlight layer was type '${existing.type}', ` +
        'recreating as fill-extrusion.');
      this.map.removeLayer(HL_LAYER);
    }
    if (!this.map.getLayer(HL_LAYER)) {
      this.map.addLayer({
        id: HL_LAYER,
        type: 'fill-extrusion',                    // must stay fill-extrusion
        source: HL_SOURCE,
        paint: {
          'fill-extrusion-color': this.highlightColor,
          'fill-extrusion-height': ['get', 'h'],
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
