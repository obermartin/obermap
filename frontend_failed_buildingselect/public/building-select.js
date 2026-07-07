// building-select.js
// Robust single-building click-selection for MapLibre fill-extrusion layers.
//
// Solves three problems that break naive queryRenderedFeatures approaches:
//   1. A visually "single" building is usually MANY features:
//      OSM building:part polygons + copies of the same polygon clipped
//      at every tile boundary.
//   2. Clicking the *wall* of a pitched extrusion can hit the flat 2D
//      footprint layer of a *different* building behind it if the query
//      isn't restricted to the fill-extrusion layer(s).
//   3. Duplicated highlight geometry z-fights with the original.
//
// Strategy:
//   - Query the exact click point, restricted to fill-extrusion layers only.
//   - Expand the selection to the whole building via same-feature-id
//     (unifies tile splits) + a geometric flood-fill over touching
//     footprints (unifies building:part stacks). Requires @turf/turf.
//   - Highlight preferably via feature-state recoloring (no duplicate
//     geometry, no z-fighting, no clipping). Falls back to a buffered,
//     slightly taller overlay extrusion if tiles carry no feature ids.
//
// Usage:
//   import { BuildingSelector } from './building-select.js';
//   const selector = new BuildingSelector(map, { highlightColor: '#ff6a00' });
//   // that's it – click to select, click empty space (or .clear()) to deselect.
//   // Survives map.setStyle(): re-wraps paint on 'styledata'.
//
// Dependencies: maplibre-gl, @turf/turf (buffer, booleanIntersects, distance, center)

import * as turf from '@turf/turf';

const HL_SOURCE = 'bsel-highlight';
const HL_LAYER = 'bsel-highlight-3d';
const WRAP_MARKER = ['feature-state', '__bsel'];

export class BuildingSelector {
  constructor(map, opts = {}) {
    this.map = map;
    this.highlightColor = opts.highlightColor ?? '#ff6a00';
    this.mode = opts.mode ?? 'auto';            // 'auto' | 'feature-state' | 'overlay'
    this.expandToParts = opts.expandToParts ?? true;
    this.adjacencyBufferM = opts.adjacencyBufferM ?? 0.25; // metres, catches shared edges
    this.searchRadiusM = opts.searchRadiusM ?? 250;        // prefilter for flood-fill
    this.overlayGrowM = opts.overlayGrowM ?? 0.35;         // overlay footprint growth
    this.layerIds = opts.layerIds ?? null;      // null = autodetect fill-extrusion layers
    this.onSelect = opts.onSelect ?? null;      // callback({ids, features}) or (null)

    this._selection = null; // { source, sourceLayer, ids: [] }
    this._wrapped = new Map(); // layerId -> original color expression

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

  _onStyleData() {
    // fires often; _prepareStyle is idempotent
    this._prepareStyle();
  }

  _prepareStyle() {
    if (!this.map.isStyleLoaded()) return;
    for (const id of this._extrusionLayerIds()) this._wrapColor(id);
    // a style switch wipes feature-state and custom layers
    if (this._selection) this._applySelection(this._selection);
  }

  _wrapColor(layerId) {
    const cur = this.map.getPaintProperty(layerId, 'fill-extrusion-color') ?? '#aaaaaa';
    if (this._isWrapped(cur)) return;
    this._wrapped.set(layerId, cur);
    this.map.setPaintProperty(layerId, 'fill-extrusion-color', [
      'case',
      ['boolean', ['coalesce', ['feature-state', 'bselSelected'], false], false],
      this.highlightColor,
      cur,
    ]);
  }

  _isWrapped(expr) {
    return Array.isArray(expr)
      && expr[0] === 'case'
      && JSON.stringify(expr).includes('"bselSelected"');
  }

  // ---------------------------------------------------------------- click

  _onClick(e) {
    const layers = this._extrusionLayerIds();
    if (!layers.length) return;

    // Exact point, extrusion layers ONLY. Never query with a bbox tolerance
    // here and never include flat 'building' fill layers – on a pitched map
    // the footprint under the cursor belongs to a different building than
    // the wall you visually clicked.
    const hits = this.map.queryRenderedFeatures(e.point, { layers });
    if (!hits.length) { this.clear(); return; }

    const seed = hits[0];
    const sel = this._collectBuilding(seed);
    this.clear();
    this._selection = sel;
    this._applySelection(sel);
    this.onSelect?.(sel);
  }

  // Expand seed feature to the full building:
  // same id (tile splits) + flood-fill over touching footprints (parts).
  _collectBuilding(seed) {
    const source = seed.source;
    const sourceLayer = seed.sourceLayer;
    const hasIds = seed.id !== undefined;

    if (!hasIds) {
      console.warn(
        '[BuildingSelector] Features carry no id. feature-state highlighting ' +
        'is impossible; falling back to overlay mode. If your tiles expose a ' +
        'unique property, set promoteId on the source.'
      );
    }

    let candidates = this.map
      .querySourceFeatures(source, { sourceLayer })
      .filter(f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));

    // prefilter by distance to keep the flood-fill cheap
    let seedCenter;
    try { seedCenter = turf.center(seed); } catch { seedCenter = null; }
    if (seedCenter) {
      candidates = candidates.filter(f => {
        try {
          return turf.distance(seedCenter, turf.center(f), { units: 'meters' }) < this.searchRadiusM;
        } catch { return false; }
      });
    }

    const selectedIds = new Set();
    const selectedFeatures = [];
    const keyOf = f => (f.id !== undefined ? `id:${f.id}` : `geo:${JSON.stringify(f.geometry.coordinates[0]?.[0])}`);
    const seen = new Set();

    const take = (f) => {
      if (f.id !== undefined) selectedIds.add(f.id);
      selectedFeatures.push(f);
    };

    // start with everything sharing the seed's id (all tile copies)
    let frontier = [];
    if (hasIds) {
      for (const f of candidates) {
        if (f.id === seed.id && !seen.has(keyOf(f) + f.geometry.coordinates.length)) {
          take(f); frontier.push(f);
        }
      }
      if (!frontier.length) { take(seed); frontier = [seed]; }
    } else {
      take(seed); frontier = [seed];
    }

    if (this.expandToParts) {
      let remaining = candidates.filter(f => !(hasIds && selectedIds.has(f.id)));
      while (frontier.length) {
        const next = [];
        for (const f of frontier) {
          let zone;
          try { zone = turf.buffer(f, this.adjacencyBufferM, { units: 'meters' }); }
          catch { continue; }
          if (!zone) continue;
          remaining = remaining.filter(c => {
            if (hasIds && selectedIds.has(c.id)) return false;
            let touch = false;
            try { touch = turf.booleanIntersects(zone, c); } catch {}
            if (touch) { take(c); next.push(c); return false; }
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
    // Buffered, slightly taller duplicate: grows the footprint outward and
    // adds ~1 m of height so it never z-fights or clips into the original.
    const feats = [];
    for (const f of sel.features) {
      let g;
      try { g = turf.buffer(f, this.overlayGrowM, { units: 'meters' }); } catch { continue; }
      if (!g) continue;
      g.properties = {
        h: Number(f.properties?.render_height ?? f.properties?.height ?? 3) + 1,
        b: Number(f.properties?.render_min_height ?? f.properties?.min_height ?? 0),
      };
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
        type: 'fill-extrusion',
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
          } catch { /* source may have changed */ }
        }
      }
      this._selection = null;
    }
    const src = this.map.getSource(HL_SOURCE);
    if (src) src.setData({ type: 'FeatureCollection', features: [] });
    this.onSelect?.(null);
  }
}
