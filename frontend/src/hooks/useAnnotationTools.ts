import { fetchRouteSegment } from '../utils/routingUtils';
import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import type { Annotation, ToolType, StrokeType, RouteMode, AppSettings } from '../types';

import { createCirclePolygon, calculateDistance, simplifyLine, transliterateToGerman, createArrowFeatures } from '../utils/mapUtils';
import { getContrastYIQ } from '../utils/colorUtils';
import anyAscii from 'any-ascii';
import { getMmsiFlagHtml } from '../utils/mapUtils';

interface UseAnnotationToolsProps {
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  mapLoaded: boolean;
  activeTool: ToolType | null;
  currentColor: string;
  currentStrokeType: StrokeType | undefined;
  currentFillOpacity: number | undefined;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: (id: string | null) => void;
  setSelectedGeojsonFeatureId: (id: string | number | null) => void;
  selectedAircraftId: string | null;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  selectedIconId: string | null | undefined;
  routeMode: RouteMode | undefined;
  activeDrawMarkersRef: React.MutableRefObject<{[key: string]: maplibregl.Marker}>;
  currentDrawSessionRef: React.MutableRefObject<number>;
  isDrawing: React.MutableRefObject<boolean>;
  currentShapeCoords: React.MutableRefObject<[number, number][]>;
  circleCenter: React.MutableRefObject<[number, number] | null>;
  arrowStart: React.MutableRefObject<[number, number] | null>;
  pendingFetchesRef: React.MutableRefObject<number>;
  setActiveDistance: React.Dispatch<React.SetStateAction<number | null>>;
  updateActiveDrawing: (geojson: any) => void;
  clearActiveDrawMarkers: () => void;
  setSelectedAircraftId: (id: string | null) => void;
  selectedCycloneIdRef: React.MutableRefObject<{ id: string, ep: string } | null>;
  selectedEarthquakeRef: React.MutableRefObject<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>;
  selectedVolcanoRef: React.MutableRefObject<{ id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null>;
  selectedCemsEarthquakeRef: React.MutableRefObject<{ id: string, code: string, properties: any, coordinates: [number, number] } | null>;
  activeVesselMmsiRef: React.MutableRefObject<string | null>;
  vesselPopupRef: React.MutableRefObject<maplibregl.Popup | null>;
  vesselsRef: React.MutableRefObject<any>;
  setSelectedAnnotationId: (id: string | null) => void;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string } | null>>;
  setHeadlinePrompt: React.Dispatch<React.SetStateAction<{ id?: string; initialPrimary?: string; initialSecondary?: string } | null>> | undefined;
  terrestrialCountriesRef: React.MutableRefObject<any>;
}

export function useAnnotationTools({
  mapRef,
  mapLoaded,
  activeTool,
  currentColor,
  currentStrokeType,
  currentFillOpacity,
  annotations,
  setAnnotations,
  activeGeojsonLayerId,
  setActiveGeojsonLayerId,
  setSelectedGeojsonFeatureId,
  selectedAircraftId,
  settings,
  setSettings,
  selectedIconId,
  routeMode,
  activeDrawMarkersRef,
  currentDrawSessionRef,
  isDrawing,
  currentShapeCoords,
  circleCenter,
  arrowStart,
  pendingFetchesRef,
  setActiveDistance,
  updateActiveDrawing,

  setSelectedAircraftId,
  selectedCycloneIdRef,
  selectedEarthquakeRef,
  selectedVolcanoRef,
  selectedCemsEarthquakeRef,
  activeVesselMmsiRef,
  vesselPopupRef,
  vesselsRef,
  setSelectedAnnotationId,
  setLabelPrompt,
  setHeadlinePrompt,
  terrestrialCountriesRef,
  clearActiveDrawMarkers
}: UseAnnotationToolsProps) {
  const routeClickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const routeGeometryRef = useRef<any>(null);
  const routeLegsRef = useRef<{ distance: number; duration: number }[]>([]);
  const routeSegmentsRef = useRef<{ [idx: number]: [number, number][] }>({});
  const routeLegsSegmentsRef = useRef<{ [idx: number]: { distance: number, duration: number } }>({});

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      // Handle GeoJSON Edit Mode first
      const activeLayer = settings.layers.find(l => l.id === activeGeojsonLayerId);
      if (activeGeojsonLayerId && activeLayer?.type === 'geojson') {
        const geojsonLayerId = `dynamic-layer-${activeGeojsonLayerId}`;
        const geojsonLineLayerId = `dynamic-line-${activeGeojsonLayerId}`;
        let clickedGeojsonFeatureId: string | number | null = null;
        
        try {
          const features = map.queryRenderedFeatures(e.point, { layers: [geojsonLayerId, geojsonLineLayerId] });
          if (features.length > 0) {
            clickedGeojsonFeatureId = features[0].properties?.id || features[0].id;
          }
        } catch (err) {
          // Layer might not exist
        }

        if (clickedGeojsonFeatureId) {
          setSelectedGeojsonFeatureId(clickedGeojsonFeatureId);
        } else {
          setActiveGeojsonLayerId(null);
          setSelectedGeojsonFeatureId(null);
        }
        return; // Prevent other interactions
      }

      // Handle flight aircraft selection
      let clickedFlightId: string | null = null;
      try {
        const flightLayers = settings.layers.filter(l => l.type === 'flights').map(l => `dynamic-layer-${l.id}`);
        if (flightLayers.length > 0) {
          const flightFeatures = map.queryRenderedFeatures(e.point, { layers: flightLayers });

          if (flightFeatures.length > 0) {
            clickedFlightId = flightFeatures[0].properties?.icao24 || null;
          }
        }
      } catch (err) {
        // layer might not be rendered
      }

      if (clickedFlightId) {
        if (selectedAircraftId === clickedFlightId) {
          setSelectedAircraftId(null);
        } else {
          setSelectedAircraftId(clickedFlightId);
        }
        return; // Prevent drawing or selecting other stuff
      } else {
        if (selectedAircraftId) {
          setSelectedAircraftId(null);
        }
      }

      // Handle cyclone click
      let clickedCycloneId: { id: string, ep: string } | null = null;
      let clickedCycloneLayerId: string | null = null;
      try {
        const cycloneLayers = settings.layers.filter(l => l.type === 'gdacs_cyclones');
        const cycloneLayerIds = cycloneLayers.map(l => `dynamic-layer-${l.id}`);
        if (cycloneLayerIds.length > 0) {
          const cycloneFeatures = map.queryRenderedFeatures(e.point, { layers: cycloneLayerIds });
          if (cycloneFeatures.length > 0) {
            const props = cycloneFeatures[0].properties;
            if (props && props.eventid && props.episodeid) {
              clickedCycloneId = { id: props.eventid.toString(), ep: props.episodeid.toString() };
              clickedCycloneLayerId = cycloneFeatures[0].layer.id.replace('dynamic-layer-', '');
            }
          }
        }
      } catch (err) {}

      if (clickedCycloneId && clickedCycloneLayerId) {
        if (selectedCycloneIdRef.current?.id === clickedCycloneId.id) {
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.id === clickedCycloneLayerId ? { ...l, selectedFeatureData: null } : l)
          }));
        } else {
          const feat = clickedCycloneId;
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.id === clickedCycloneLayerId ? { ...l, selectedFeatureData: feat } : l)
          }));
        }
        return; // Prevent drawing
      } else {
        if (selectedCycloneIdRef.current) {
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.type === 'gdacs_cyclones' ? { ...l, selectedFeatureData: null } : l)
          }));
        }
      }

      // Handle earthquake click
      let clickedEarthquake: { id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null = null;
      let clickedEqLayerId: string | null = null;
      try {
        const earthquakeLayers = settings.layers.filter(l => l.type === 'gdacs_earthquakes');
        const eqLayerIds = earthquakeLayers.map(l => `dynamic-layer-${l.id}`);
        if (eqLayerIds.length > 0) {
          const eqFeatures = map.queryRenderedFeatures(e.point, { layers: eqLayerIds });
          if (eqFeatures.length > 0) {
            const props = eqFeatures[0].properties;
            const geom = eqFeatures[0].geometry as GeoJSON.Point;
            if (props && props.eventid && props.episodeid && props.url && geom && geom.type === 'Point') {
              const urlObj = typeof props.url === 'string' ? JSON.parse(props.url) : props.url;
              if (urlObj && urlObj.geometry) {
                clickedEarthquake = { 
                  id: props.eventid.toString(), 
                  ep: props.episodeid.toString(), 
                  geomUrl: urlObj.geometry,
                  coordinates: geom.coordinates as [number, number],
                  properties: props
                };
                clickedEqLayerId = eqFeatures[0].layer.id.replace('dynamic-layer-', '');
              }
            }
          }
        }
      } catch (err) {}

      if (clickedEarthquake && clickedEqLayerId) {
        if (selectedEarthquakeRef.current?.id === clickedEarthquake.id) {
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.id === clickedEqLayerId ? { ...l, selectedFeatureData: null } : l)
          }));
        } else {
          const feat = clickedEarthquake;
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.id === clickedEqLayerId ? { ...l, selectedFeatureData: feat } : l)
          }));
        }
        return; // Prevent drawing
      } else {
        if (selectedEarthquakeRef.current) {
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.type === 'gdacs_earthquakes' ? { ...l, selectedFeatureData: null } : l)
          }));
        }
      }

      // Handle volcano click
      let clickedVolcano: { id: string, ep: string, geomUrl: string, coordinates: [number, number], properties: any } | null = null;
      let clickedVolLayerId: string | null = null;
      try {
        const volcanoLayers = settings.layers.filter(l => l.type === 'gdacs_volcanoes');
        const volLayerIds = volcanoLayers.map(l => `dynamic-layer-${l.id}`);
        if (volLayerIds.length > 0) {
          const volFeatures = map.queryRenderedFeatures(e.point, { layers: volLayerIds });
          if (volFeatures.length > 0) {
            const props = volFeatures[0].properties;
            const geom = volFeatures[0].geometry as GeoJSON.Point;
            if (props && props.eventid && props.episodeid && props.url && geom && geom.type === 'Point') {
              const urlObj = typeof props.url === 'string' ? JSON.parse(props.url) : props.url;
              if (urlObj && urlObj.geometry) {
                clickedVolcano = { 
                  id: props.eventid.toString(), 
                  ep: props.episodeid.toString(), 
                  geomUrl: urlObj.geometry,
                  coordinates: geom.coordinates as [number, number],
                  properties: props
                };
                clickedVolLayerId = volFeatures[0].layer.id.replace('dynamic-layer-', '');
              }
            }
          }
        }
      } catch (err) {}

      if (clickedVolcano && clickedVolLayerId) {
        if (selectedVolcanoRef.current?.id === clickedVolcano.id) {
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.id === clickedVolLayerId ? { ...l, selectedFeatureData: null } : l)
          }));
        } else {
          const feat = clickedVolcano;
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.id === clickedVolLayerId ? { ...l, selectedFeatureData: feat } : l)
          }));
        }
        return; // Prevent drawing
      } else {
        if (selectedVolcanoRef.current) {
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.type === 'gdacs_volcanoes' ? { ...l, selectedFeatureData: null } : l)
          }));
        }
      }

      // Handle CEMS earthquake click
      let clickedCemsEarthquake: { id: string, code: string, properties: any, coordinates: [number, number] } | null = null;
      let clickedCemsLayerId: string | null = null;
      try {
        const cemsLayers = settings.layers.filter(l => l.type === 'cems_rapid_mapping');
        const cemsLayerIds = cemsLayers.map(l => `dynamic-layer-${l.id}`);
        if (cemsLayerIds.length > 0) {
          const cemsFeatures = map.queryRenderedFeatures(e.point, { layers: cemsLayerIds });
          if (cemsFeatures.length > 0) {
            const props = cemsFeatures[0].properties;
            const geom = cemsFeatures[0].geometry as GeoJSON.Point;
            if (props && props.code && geom && geom.type === 'Point') {
              clickedCemsEarthquake = { 
                id: props.code, 
                code: props.code, 
                properties: props,
                coordinates: geom.coordinates as [number, number]
              };
              clickedCemsLayerId = cemsFeatures[0].layer.id.replace('dynamic-layer-', '');
            }
          }
        }
      } catch (err) {}

      if (clickedCemsEarthquake && clickedCemsLayerId) {
        if (selectedCemsEarthquakeRef.current?.id === clickedCemsEarthquake.id) {
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.id === clickedCemsLayerId ? { ...l, selectedFeatureData: null } : l)
          }));
        } else {
          const feat = clickedCemsEarthquake;
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.id === clickedCemsLayerId ? { ...l, selectedFeatureData: feat } : l)
          }));
        }
        return; // Prevent drawing
      } else {
        if (selectedCemsEarthquakeRef.current) {
          setSettings(prev => ({
            ...prev,
            layers: prev.layers.map(l => l.type === 'cems_rapid_mapping' ? { ...l, selectedFeatureData: null } : l)
          }));
        }
      }

      // Handle vessel click
      let clickedVesselMmsi: string | null = null;
      try {
        const vesselLayers = settings.layers.filter(l => l.type === 'vessels').map(l => `dynamic-layer-${l.id}`);
        if (vesselLayers.length > 0) {
          const vesselFeatures = map.queryRenderedFeatures(e.point, { layers: vesselLayers });
          if (vesselFeatures.length > 0) {
            clickedVesselMmsi = vesselFeatures[0].properties?.mmsi || null;
          }
        }
      } catch (err) {}

      if (clickedVesselMmsi) {
        if (activeVesselMmsiRef.current === clickedVesselMmsi) {
          activeVesselMmsiRef.current = null;
          window.dispatchEvent(new CustomEvent('vesselSelected', { detail: null }));
          if (vesselPopupRef.current) {
            vesselPopupRef.current.remove();
            vesselPopupRef.current = null;
          }
          const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
          if (trackSource) trackSource.setData({ type: 'FeatureCollection', features: [] });
        } else {
          activeVesselMmsiRef.current = clickedVesselMmsi;
          window.dispatchEvent(new CustomEvent('vesselSelected', { detail: clickedVesselMmsi }));
          const v = vesselsRef.current.get(clickedVesselMmsi);
          if (v && v.lat != null && v.lon != null) {
            if (!vesselPopupRef.current) {
              vesselPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
                .setLngLat([v.lon, v.lat])
                .addTo(map);
            } else {
              vesselPopupRef.current.setLngLat([v.lon, v.lat]);
            }
            const style = document.getElementById('flight-popup-style') || document.createElement('style');
            style.id = 'flight-popup-style';
            style.innerHTML = '.flight-popup .maplibregl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .maplibregl-popup-tip { border-top-color: #09090b; }';
            if (!document.getElementById('flight-popup-style')) document.head.appendChild(style);
            
            const spd = v.sog != null ? Math.round(v.sog) + 'kn' : 'N/A';
            const hdg = v.heading != null ? Math.round(v.heading) + '°' : 'N/A';
            const flag = getMmsiFlagHtml(v.mmsi);
            const popupHtml = `
              <div style="background-color: #09090b; padding: 12px; border-radius: 0; color: white; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; min-width: 180px; text-transform: uppercase;">
                <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #ffffff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
                  <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.name || 'UNKNOWN'}</span>
                  <span style="font-size: 16px; margin-left: 8px;">${flag}</span>
                </div>
                <div style="display: grid; grid-template-columns: 40px 1fr; gap: 6px; font-weight: 500;">
                  <span style="color: rgba(255,255,255,0.5);">MMSI:</span> <span style="text-align: right; font-family: monospace;">${v.mmsi}</span>
                  <span style="color: rgba(255,255,255,0.5);">CALL:</span> <span style="text-align: right; font-family: monospace;">${v.callSign || 'N/A'}</span>
                  <span style="color: rgba(255,255,255,0.5);">DEST:</span> <span style="text-align: right; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.destination || 'N/A'}</span>
                  <span style="color: rgba(255,255,255,0.5);">SPD:</span> <span style="text-align: right; font-family: monospace;">${spd}</span>
                  <span style="color: rgba(255,255,255,0.5);">HDG:</span> <span style="text-align: right; font-family: monospace;">${hdg}</span>
                </div>
              </div>
            `;
            vesselPopupRef.current.setHTML(popupHtml);

            const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
            if (trackSource && v.track && v.track.length > 1) {
              trackSource.setData({
                type: 'FeatureCollection',
                features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: v.track }, properties: {} }]
              });
            } else if (trackSource) {
              trackSource.setData({ type: 'FeatureCollection', features: [] });
            }
          }
        }
        return; // Prevent drawing or selecting other stuff
      } else {
        if (activeVesselMmsiRef.current) {
          activeVesselMmsiRef.current = null;
          window.dispatchEvent(new CustomEvent('vesselSelected', { detail: null }));
          if (vesselPopupRef.current) {
            vesselPopupRef.current.remove();
            vesselPopupRef.current = null;
          }
          const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
          if (trackSource) trackSource.setData({ type: 'FeatureCollection', features: [] });
        }
      }
      let features: maplibregl.MapGeoJSONFeature[] = [];
      try {
        features = map.queryRenderedFeatures(e.point, { layers: ['custom-polygons', 'custom-lines', 'custom-lines-dashed', 'custom-lines-dotted', 'custom-arrow-heads'] });
      } catch (err) {}
      let clickedAnnotationId: string | null = null;
      
      // Smart Event Delegation: ignore polygon fills ('custom-polygons') 
      // so clicks pass through to allow adding annotations inside countries.
      // Selection will only happen if clicking the border ('custom-lines' etc).
      const targetFeature = features.find(f => f.layer.id !== 'custom-polygons');
      
      if (targetFeature) {
        clickedAnnotationId = targetFeature.properties?.id;
        if (clickedAnnotationId && activeTool !== 'none' && activeTool !== 'highlight') {
          setSelectedAnnotationId(clickedAnnotationId);
          return; // Prevent drawing if we selected an element
        }
      } else {
        if (activeTool !== 'none' && activeTool !== 'highlight') {
          setSelectedAnnotationId(null);
        }
      }

      if (activeTool === 'none') return;

      if (activeTool === 'icon' && selectedIconId) {
        setAnnotations(prev => [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: 'icon',
          iconId: selectedIconId,
          color: currentColor,
          coordinates: [e.lngLat.lng, e.lngLat.lat]
        }]);
        return;
      }
      
      if (activeTool === 'label') {
        setLabelPrompt({ lngLat: [e.lngLat.lng, e.lngLat.lat] });
        return;
      }

      if (activeTool === 'headline') {
        setHeadlinePrompt?.({});
        return;
      }

      if (activeTool === 'highlight') {
        const selectedId = settings.labelTemplates?.highlightLabelTemplate;
        const variation = settings.labelTemplates?.variations?.find(v => v.id === selectedId);
        const actualTemplate = variation ? variation.baseTemplate : selectedId;
        const actualTheme = settings.labelTemplates?.savedThemes?.[selectedId || ''];
        const evaluateExpression = (expr: any, zoom: number, feature: maplibregl.MapGeoJSONFeature): any => {
          if (typeof expr !== 'object' || expr === null) return expr;
          if (!Array.isArray(expr)) return expr;
          const type = expr[0];
          
          if (type === 'get') {
            return feature.properties?.[expr[1]];
          }
          if (type === 'has') {
            return feature.properties?.[expr[1]] !== undefined;
          }
          if (type === '==') {
            return evaluateExpression(expr[1], zoom, feature) === evaluateExpression(expr[2], zoom, feature);
          }
          if (type === '!=') {
            return evaluateExpression(expr[1], zoom, feature) !== evaluateExpression(expr[2], zoom, feature);
          }
          if (type === 'step') {
            const input = evaluateExpression(expr[1], zoom, feature);
            let val = evaluateExpression(expr[2], zoom, feature);
            for (let i = 3; i < expr.length; i += 2) {
              if (input >= expr[i]) val = evaluateExpression(expr[i + 1], zoom, feature);
              else break;
            }
            return val;
          }
          if (type === 'interpolate') {
            const input = evaluateExpression(expr[2], zoom, feature);
            for (let i = 3; i < expr.length; i += 2) {
              if (input === expr[i]) return evaluateExpression(expr[i + 1], zoom, feature);
              if (input < expr[i]) {
                if (i === 3) return evaluateExpression(expr[i + 1], zoom, feature);
                const z0 = expr[i - 2], v0 = evaluateExpression(expr[i - 1], zoom, feature);
                const z1 = expr[i], v1 = evaluateExpression(expr[i + 1], zoom, feature);
                const t = (input - z0) / (z1 - z0);
                return v0 + t * (v1 - v0);
              }
            }
            return evaluateExpression(expr[expr.length - 1], zoom, feature);
          }
          if (type === 'match') {
            const input = evaluateExpression(expr[1], zoom, feature);
            for (let i = 2; i < expr.length - 1; i += 2) {
              const cases = Array.isArray(expr[i]) ? expr[i] : [expr[i]];
              if (cases.includes(input)) return evaluateExpression(expr[i + 1], zoom, feature);
            }
            return evaluateExpression(expr[expr.length - 1], zoom, feature);
          }
          if (type === 'case') {
            for (let i = 1; i < expr.length - 1; i += 2) {
              if (evaluateExpression(expr[i], zoom, feature)) return evaluateExpression(expr[i + 1], zoom, feature);
            }
            return evaluateExpression(expr[expr.length - 1], zoom, feature);
          }
          if (type === 'zoom') {
            return zoom;
          }
          if (type === 'all') {
            for (let i = 1; i < expr.length; i++) {
              if (!evaluateExpression(expr[i], zoom, feature)) return false;
            }
            return true;
          }
          if (type === 'any') {
            for (let i = 1; i < expr.length; i++) {
              if (evaluateExpression(expr[i], zoom, feature)) return true;
            }
            return false;
          }
          
          return null; // unsupported expression
        };

        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 5, e.point.y - 5],
          [e.point.x + 5, e.point.y + 5]
        ];
        const features = map.queryRenderedFeatures(bbox);
        const currentZoom = map.getZoom();
        
        const validSymbolFeatures = features.filter(f => {
          if (f.layer?.type !== 'symbol') return false;
          if (!f.properties?.name && !f.properties?.name_en && !f.properties?.name_de) return false;
          
          try {
            const layerId = f.layer.id;
            const minZoom = map.getLayer(layerId)?.minzoom || 0;
            const maxZoom = map.getLayer(layerId)?.maxzoom || 24;
            if (currentZoom < minZoom || currentZoom > maxZoom) return false;

            const textOpacity = map.getPaintProperty(layerId, 'text-opacity');
            if (textOpacity !== undefined) {
              if (typeof textOpacity === 'number' && textOpacity === 0) return false;
              if (Array.isArray(textOpacity)) {
                const val = evaluateExpression(textOpacity, currentZoom, f);
                if (val === 0) return false;
              }
            }
            
            const textSize = map.getLayoutProperty(layerId, 'text-size');
            if (textSize !== undefined) {
              if (typeof textSize === 'number' && textSize === 0) return false;
              if (Array.isArray(textSize)) {
                const val = evaluateExpression(textSize, currentZoom, f);
                if (val === 0) return false;
              }
            }

            const textField = map.getLayoutProperty(layerId, 'text-field');
            if (textField !== undefined) {
              if (Array.isArray(textField)) {
                const val = evaluateExpression(textField, currentZoom, f);
                if (val === '') return false;
              }
            }

            return true;
          } catch (e) {
            return true; // default to true if we can't determine visibility
          }
        });
        
        // Prioritize place labels over country/state labels
        const symbolFeature = validSymbolFeatures.sort((a, b) => {
          const aId = a.layer?.id.toLowerCase() || '';
          const bId = b.layer?.id.toLowerCase() || '';
          
          const getScore = (id: string) => {
            if (id.includes('poi')) return 4;
            if (id.includes('settlement') || id.includes('place') || id.includes('city') || id.includes('town')) return 3;
            if (id.includes('water') || id.includes('natural')) return 2;
            if (id.includes('state') || id.includes('admin-1') || id.includes('province')) return 1;
            if (id.includes('country') || id.includes('admin-0')) return 0;
            return 2; // default middle score
          };
          
          return getScore(bId) - getScore(aId);
        })[0];
        
        if (symbolFeature) {
          const props = symbolFeature.properties || {};
          // Prioritize the native name (usually Cyrillic for Ukraine/Russia)
          const nameNative = props.name || '';
          const hasCyrillic = /[А-Яа-яЁёІіЇїЄєҐґ]/.test(nameNative);
          
          let name = props.name_de || props.name_en || props.name_int || props.name || '';
          if (hasCyrillic) {
            // Determine if it's Russian by checking if native name matches name_ru, OR if it lacks Ukr-specific letters
            // Mapbox usually provides name_ru and name_uk for major cities in both countries.
            const isRussian = props.name_ru && props.name === props.name_ru && props.name !== props.name_uk;
            name = transliterateToGerman(nameNative, isRussian);
          } else if (!props.name_de && !props.name_en && !props.name_int && nameNative) {
            // If no Latin translation exists, check if the native script contains exotic non-Latin characters (Arabic, Farsi, Chinese, etc.)
            // We only do this if all standard Latin name fields are missing, to avoid destroying valid Latin accents (like 'ü').
            const needsTransliteration = /[^\u0000-\u024F\u1E00-\u1EFF]/.test(nameNative);
            if (needsTransliteration) {
              name = anyAscii(nameNative);
            }
          }
          
          let coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          if (symbolFeature.geometry.type === 'Point') {
            coords = symbolFeature.geometry.coordinates as [number, number];
          }
          const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          setAnnotations(prev => [...prev, {
            id: newId,
            type: 'highlight',
            color: currentColor,
            template: actualTemplate,
            theme: actualTheme,
            coordinates: coords,
            text: name,
            animationTriggerId: newId,
            view: {
              center: coords,
              zoom: mapRef.current!.getZoom(),
              pitch: mapRef.current!.getPitch(),
              bearing: mapRef.current!.getBearing(),
            elevation: mapRef.current!.queryTerrainElevation(coords as [number, number]) || 0
          }
          }]);
        } else if (clickedAnnotationId) {
          // If we clicked on an existing country polygon but missed all labels, select it instead of duplicating it
          setSelectedAnnotationId(clickedAnnotationId);
        } else {
          // Fetch country boundary if clicking on empty space
          const fetchCountry = async () => {
            try {
              document.body.style.cursor = 'wait';
              
              let terrestrialGeometry = null;
              if (!terrestrialCountriesRef.current) {
                try {
                  const cRes = await fetch('/countries.geo.json');
                  terrestrialCountriesRef.current = await cRes.json();
                } catch (e) {
                  console.error("Failed to load terrestrial countries", e);
                }
              }
              if (terrestrialCountriesRef.current) {
                const pt = turf.point([e.lngLat.lng, e.lngLat.lat]);
                for (const feature of terrestrialCountriesRef.current.features) {
                  if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                    if (turf.booleanPointInPolygon(pt, feature)) {
                      terrestrialGeometry = feature.geometry;
                      break;
                    }
                  }
                }
              }

              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.lngLat.lat}&lon=${e.lngLat.lng}&zoom=3&polygon_geojson=1&polygon_threshold=0.01`);
              const data = await res.json();
              if (data && data.geojson) {
                const nameNative = data.name || data.display_name || '';
                const hasCyrillic = /[А-Яа-яЁёІіЇїЄєҐґ]/.test(nameNative);
                let name = nameNative;
                if (hasCyrillic) {
                  const isRussian = data.address?.country_code === 'ru';
                  name = transliterateToGerman(nameNative, isRussian);
                } else if (nameNative) {
                  const needsTransliteration = /[^\u0000-\u024F\u1E00-\u1EFF]/.test(nameNative);
                  if (needsTransliteration) name = anyAscii(nameNative);
                }
                
                const centerLng = parseFloat(data.lon);
                const centerLat = parseFloat(data.lat);
                
                const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                setAnnotations(prev => [...prev, {
                  id: newId,
                  type: 'highlight',
                  color: currentColor,
                  template: actualTemplate,
                  theme: actualTheme,
                  strokeType: currentStrokeType || 'solid',
                  fillOpacity: currentFillOpacity ?? 0.5,
                  coordinates: [centerLng, centerLat],
                  polygonGeometry: terrestrialGeometry || data.geojson,
                  text: name,
                  animationTriggerId: newId,
                  view: {
                    center: [centerLng, centerLat],
                    zoom: mapRef.current?.getZoom() || 4,
                    pitch: mapRef.current?.getPitch() || 0,
                    bearing: mapRef.current?.getBearing() || 0
                  }
                }]);
              }
            } catch (err) {
              console.error('Failed to fetch country from Nominatim', err);
            } finally {
              document.body.style.cursor = '';
            }
          };
          fetchCountry();
        }
        return;
      }

      if (activeTool === 'polygon') {
        if (!isDrawing.current) {
          isDrawing.current = true;
          currentShapeCoords.current = [[e.lngLat.lng, e.lngLat.lat]];
        } else {
          const lastPoint = currentShapeCoords.current[currentShapeCoords.current.length - 1];
          const p1 = map.project(lastPoint);
          const p2 = e.point;
          const distPx = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
          if (distPx < 10) return; // Prevent double-click from adding a micro-segment

          currentShapeCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
          updateActiveDrawing({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [...currentShapeCoords.current] },
            properties: { color: currentColor }
          });
        }
      }


      if (activeTool === 'measure') {
        if (!isDrawing.current) {
          isDrawing.current = true;
          currentShapeCoords.current = [[e.lngLat.lng, e.lngLat.lat]];
        } else {
          const lastPoint = currentShapeCoords.current[currentShapeCoords.current.length - 1];
          const p1 = map.project(lastPoint);
          const p2 = e.point;
          const distPx = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
          if (distPx < 10) return; // Prevent double-click from adding a micro-segment

          currentShapeCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
          updateActiveDrawing({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [...currentShapeCoords.current] },
            properties: { color: currentColor }
          });
        }
        
        // Add static measure marker for this vertex
        const dist = calculateDistance(currentShapeCoords.current);
        const labelEl = document.createElement('div');
        labelEl.className = 'label-marker-measure-draw';
        labelEl.style.width = '0px';
        labelEl.style.height = '0px';
        labelEl.style.position = 'relative';
        labelEl.style.pointerEvents = 'none';
        labelEl.innerHTML = `
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
            <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
              ${dist.toFixed(2)} km
            </div>
          </div>
        `;
        const markerId = `measure-${currentShapeCoords.current.length - 1}`;
        activeDrawMarkersRef.current[markerId] = new maplibregl.Marker({ element: labelEl })
          .setLngLat([e.lngLat.lng, e.lngLat.lat])
          .addTo(map);
      }

      if (activeTool === 'route') {
        const point = [e.lngLat.lng, e.lngLat.lat] as [number, number];
        
        const addRouteMarker = (lngLat: [number, number], legs: { distance: number; duration: number }[], idx: number) => {
          const totalDist = legs.reduce((acc, leg) => acc + leg.distance, 0) / 1000;
          const totalDur = legs.reduce((acc, leg) => acc + leg.duration, 0);
          const hrs = Math.floor(totalDur / 3600);
          const mins = Math.round((totalDur % 3600) / 60);
          const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
          
          const labelEl = document.createElement('div');
          labelEl.className = 'label-marker-route-draw';
          labelEl.style.width = '0px';
          labelEl.style.height = '0px';
          labelEl.style.position = 'relative';
          labelEl.style.pointerEvents = 'none';
          labelEl.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
              <div class="custom-marker-flat text-center leading-tight" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                ${totalDist.toFixed(1)} km<br/><span style="font-size:0.75em;opacity:0.9">${timeStr}</span>
              </div>
            </div>
          `;
          
          const markerId = `route-${idx}`;
          activeDrawMarkersRef.current[markerId] = new maplibregl.Marker({ element: labelEl })
            .setLngLat(lngLat)
            .addTo(map);
        };

        if (routeClickTimeoutRef.current) {
          clearTimeout(routeClickTimeoutRef.current);
          routeClickTimeoutRef.current = null;
          return;
        }

        const ePoint = e.point;

        routeClickTimeoutRef.current = setTimeout(() => {
          routeClickTimeoutRef.current = null;

          if (!isDrawing.current) {
            isDrawing.current = true;
          currentDrawSessionRef.current = (currentDrawSessionRef.current || 0) + 1;
          pendingFetchesRef.current = 0;
          currentShapeCoords.current = [point];
          routeGeometryRef.current = { type: 'LineString', coordinates: [point] };
          routeLegsRef.current = [];
          routeSegmentsRef.current = {};
          routeLegsSegmentsRef.current = {};
          
          const labelEl = document.createElement('div');
          labelEl.className = 'label-marker-route-start';
          labelEl.style.width = '0px';
          labelEl.style.height = '0px';
          labelEl.style.position = 'relative';
          labelEl.style.pointerEvents = 'none';
          labelEl.innerHTML = `
            <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
              <div class="custom-marker-flat text-xs font-bold uppercase tracking-wider" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                START
              </div>
            </div>
          `;
          activeDrawMarkersRef.current[`route-0`] = new maplibregl.Marker({ element: labelEl })
            .setLngLat(point)
            .addTo(map);
        } else {
          const lastPoint = currentShapeCoords.current[currentShapeCoords.current.length - 1];
          const p1 = map.project(lastPoint);
          const p2 = ePoint || map.project(point);
          const distPx = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
          if (distPx < 10) return;

          const currentIdx = currentShapeCoords.current.length;
          currentShapeCoords.current.push(point);
          
            const sessionId = currentDrawSessionRef.current;
            pendingFetchesRef.current += 1;
            fetchRouteSegment(lastPoint, point, routeMode || 'driving', settings.googleMapsToken)
              .then(({ coords, leg }) => {
                pendingFetchesRef.current -= 1;
                if (sessionId !== currentDrawSessionRef.current) return;
                
                routeSegmentsRef.current[currentIdx] = coords;
                routeLegsSegmentsRef.current[currentIdx] = leg;
                
                const fullCoords = [currentShapeCoords.current[0]];
                const fullLegs = [];
                for (let i = 1; i <= currentShapeCoords.current.length; i++) {
                  if (routeSegmentsRef.current[i]) {
                    fullCoords.push(...routeSegmentsRef.current[i]);
                    fullLegs.push(routeLegsSegmentsRef.current[i]);
                  }
                }
                routeGeometryRef.current.coordinates = fullCoords;
                routeLegsRef.current = fullLegs;
                
                updateActiveDrawing({
                  type: 'Feature',
                  geometry: routeGeometryRef.current,
                  properties: { color: currentColor }
                });
                addRouteMarker(point, fullLegs, currentIdx);
              })
              .catch((err: any) => {
                pendingFetchesRef.current -= 1;
                console.error('Routing error:', err);
              });
        }
        }, 250);
      }
    };

    const onMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (activeTool === 'none') return;
      if ((e.originalEvent?.target as HTMLElement)?.closest('.maplibregl-marker')) return;

      // Check if we clicked on an existing annotation feature FIRST
      let features: maplibregl.MapGeoJSONFeature[] = [];
      try {
        features = map.queryRenderedFeatures(e.point, { layers: ['custom-polygons', 'custom-lines', 'custom-lines-dashed', 'custom-lines-dotted', 'custom-arrow-heads'] });
      } catch (e) {
        // layer might not be ready
      }
      
      // Smart Event Delegation: ignore polygon fills so drawing tools can start inside them.
      const targetFeature = features.find(f => f.layer.id !== 'custom-polygons');
      
      if (targetFeature) {
        const clickedId = targetFeature.properties?.id;
        if (clickedId) {
          setSelectedAnnotationId(clickedId);
          return; // Prevent drawing if we selected an element
        }
      } else {
        setSelectedAnnotationId(null);
      }

      if (activeTool === 'paint') {
        isDrawing.current = true;
        currentShapeCoords.current = [[e.lngLat.lng, e.lngLat.lat]];
        map.dragPan.disable(); // Prevent map panning while drawing
      }

      if (activeTool === 'circle') {
        isDrawing.current = true;
        circleCenter.current = [e.lngLat.lng, e.lngLat.lat];
        map.dragPan.disable();
        
        // Add live center dot
        const centerEl = document.createElement('div');
        centerEl.className = 'label-marker-circle-center-draw';
        centerEl.style.width = '0px';
        centerEl.style.height = '0px';
        centerEl.style.position = 'relative';
        centerEl.style.pointerEvents = 'none';
        centerEl.innerHTML = `
          <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center;">
            <div class="custom-marker-dot" style="background-color: ${currentColor};"></div>
          </div>
        `;
        activeDrawMarkersRef.current['circle-center'] = new maplibregl.Marker({ element: centerEl })
          .setLngLat(circleCenter.current)
          .addTo(map);
      }

      if (activeTool === 'arrow') {
        if (!isDrawing.current) {
          isDrawing.current = true;
          arrowStart.current = [e.lngLat.lng, e.lngLat.lat];
          map.dragPan.disable();
        }
      }
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (activeTool === 'highlight') {
        const features = map.queryRenderedFeatures(e.point);
        const hasSymbol = features.some(f => f.layer?.type === 'symbol' && (f.properties?.name || f.properties?.name_en));
        map.getCanvas().style.cursor = hasSymbol ? 'pointer' : 'crosshair';
        return;
      }

      if (!isDrawing.current || activeTool === 'none') return;

      if (activeTool === 'paint') {
        currentShapeCoords.current.push([e.lngLat.lng, e.lngLat.lat]);
        updateActiveDrawing({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [...currentShapeCoords.current] },
          properties: { color: currentColor }
        });
      }

      if (activeTool === 'circle' && circleCenter.current) {
        const currentPos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const radius = turf.distance(circleCenter.current, currentPos, { units: 'kilometers' });
        if (radius > 0) {
          const circlePoly = createCirclePolygon(circleCenter.current, radius);
          if (circlePoly) {
            updateActiveDrawing({
              ...circlePoly,
              properties: { color: currentColor }
            });
            
            // Update live radius marker
            if (!activeDrawMarkersRef.current['circle-radius']) {
              const labelEl = document.createElement('div');
              labelEl.className = 'label-marker-circle-radius';
              labelEl.style.width = '0px';
              labelEl.style.height = '0px';
              labelEl.style.position = 'relative';
              labelEl.style.pointerEvents = 'none';
              labelEl.innerHTML = `
                <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                  <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                    ${radius.toFixed(2)} km
                  </div>
                </div>
              `;
              activeDrawMarkersRef.current['circle-radius'] = new maplibregl.Marker({ element: labelEl })
                .setLngLat(currentPos)
                .addTo(map);
            } else {
              activeDrawMarkersRef.current['circle-radius'].setLngLat(currentPos);
              activeDrawMarkersRef.current['circle-radius'].getElement().innerHTML = `
                <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                  <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                    ${radius.toFixed(2)} km
                  </div>
                </div>
              `;
            }
          }
        }
      }

      if (activeTool === 'arrow' && arrowStart.current) {
        const currentPos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const feats = createArrowFeatures(arrowStart.current, currentPos, currentColor);
        if (feats) {
          updateActiveDrawing({
            type: 'FeatureCollection',
            features: [feats.shaft, feats.head]
          });
        }
      }

      if (activeTool === 'polygon' || activeTool === 'measure' || activeTool === 'route') {
        // Draw temporary line to cursor
        let tempLineCoords = [];
        if (activeTool === 'route') {
          tempLineCoords = [...(routeGeometryRef.current?.coordinates || []), [e.lngLat.lng, e.lngLat.lat]];
        } else {
          tempLineCoords = [...currentShapeCoords.current, [e.lngLat.lng, e.lngLat.lat]];
        }
        
        updateActiveDrawing({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: tempLineCoords },
          properties: { color: currentColor }
        });
        
        if (activeTool === 'measure' || activeTool === 'route') {
          // Update floating cursor marker
          let dist = 0;
          if (activeTool === 'route') {
            const legsDist = routeLegsRef.current.reduce((acc, leg) => acc + leg.distance, 0) / 1000;
            const lastPt = routeGeometryRef.current?.coordinates[routeGeometryRef.current.coordinates.length - 1];
            dist = legsDist + (lastPt ? turf.distance(turf.point(lastPt), turf.point([e.lngLat.lng, e.lngLat.lat]), { units: 'kilometers' }) : 0);
          } else {
            dist = calculateDistance(currentShapeCoords.current);
            dist += turf.distance(currentShapeCoords.current[currentShapeCoords.current.length - 1], [e.lngLat.lng, e.lngLat.lat], { units: 'kilometers' });
          }
          
          if (!activeDrawMarkersRef.current['measure-floating']) {
            const labelEl = document.createElement('div');
            labelEl.className = 'label-marker-measure-floating';
            labelEl.style.width = '0px';
            labelEl.style.height = '0px';
            labelEl.style.position = 'relative';
            labelEl.style.pointerEvents = 'none';
            labelEl.innerHTML = `
              <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                  ${dist.toFixed(2)} km
                </div>
              </div>
            `;
            activeDrawMarkersRef.current['measure-floating'] = new maplibregl.Marker({ element: labelEl })
              .setLngLat([e.lngLat.lng, e.lngLat.lat])
              .addTo(map);
          } else {
            activeDrawMarkersRef.current['measure-floating'].setLngLat([e.lngLat.lng, e.lngLat.lat]);
            activeDrawMarkersRef.current['measure-floating'].getElement().innerHTML = `
              <div style="position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); zoom: var(--export-annotation-scale, 1); transform-origin: center center; display: flex; align-items: center; justify-content: center;">
                <div class="custom-marker-flat" style="background-color: ${currentColor}; color: ${getContrastYIQ(currentColor)};">
                  ${dist.toFixed(2)} km
                </div>
              </div>
            `;
          }
        }
      }
    };

    const onMouseUp = (e: maplibregl.MapMouseEvent) => {
      if (!isDrawing.current) return;

      if (activeTool === 'paint') {
        isDrawing.current = false;
        map.dragPan.enable();
        if (currentShapeCoords.current.length > 2) {
          const simplified = simplifyLine(currentShapeCoords.current);
          setAnnotations(prev => [...prev, {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'paint',
            color: currentColor,
            strokeType: currentStrokeType,
            coordinates: simplified
          }]);
        }
        updateActiveDrawing({ type: 'FeatureCollection', features: [] });
        clearActiveDrawMarkers();
      }

      if (activeTool === 'circle' && circleCenter.current) {
        isDrawing.current = false;
        map.dragPan.enable();
        const currentPos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
        const radius = turf.distance(circleCenter.current, currentPos, { units: 'kilometers' });
        if (radius > 0) {
          const circlePoly = createCirclePolygon(circleCenter.current, radius);
          if (circlePoly) {
            setAnnotations(prev => [...prev, {
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              type: 'circle',
              color: currentColor,
              strokeType: currentStrokeType,
              fillOpacity: currentFillOpacity ?? 0.5,
              coordinates: circlePoly.geometry.coordinates,
              radius
            }]);
          }
        }
        updateActiveDrawing({ type: 'FeatureCollection', features: [] });
        clearActiveDrawMarkers();
        setActiveDistance(null);
        circleCenter.current = null;
      }

      if (activeTool === 'arrow' && arrowStart.current) {
        const p1 = map.project(arrowStart.current);
        const p2 = e.point || map.project(e.lngLat);
        const distPx = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        
        // Finalize if dragged more than 5 pixels, OR if this is the second click (which would be far from the first click's position)
        if (distPx > 5) {
          isDrawing.current = false;
          map.dragPan.enable();
          const currentPos: [number, number] = [e.lngLat.lng, e.lngLat.lat];
          const startPos: [number, number] = [arrowStart.current[0], arrowStart.current[1]];
          
          setAnnotations(prev => [...prev, {
            id: `arrow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'arrow',
            color: currentColor,
            strokeType: currentStrokeType,
            coordinates: [startPos, currentPos]
          }]);
          updateActiveDrawing({ type: 'FeatureCollection', features: [] });
          arrowStart.current = null;
        }
      }
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      if (activeTool === 'polygon' && isDrawing.current) {
        e.preventDefault(); // stop zoom
        isDrawing.current = false;
        
        // Kill the point added by the first click of the double-click sequence
        currentShapeCoords.current.pop();
        
        // Close polygon
        currentShapeCoords.current.push([...currentShapeCoords.current[0]]);
        
        if (currentShapeCoords.current.length >= 4) {
          setAnnotations(prev => [...prev, {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'polygon',
            color: currentColor,
            strokeType: currentStrokeType,
            fillOpacity: currentFillOpacity ?? 0.5,
            coordinates: [[...currentShapeCoords.current]]
          }]);
        }
        updateActiveDrawing({ type: 'FeatureCollection', features: [] });
        clearActiveDrawMarkers();
      }

      if (activeTool === 'measure' && isDrawing.current) {
        e.preventDefault();
        isDrawing.current = false;
        
        // Kill the point added by the first click of the double-click sequence
        const poppedIdx = currentShapeCoords.current.length - 1;
        currentShapeCoords.current.pop();
        if (activeDrawMarkersRef.current[`measure-${poppedIdx}`]) {
          activeDrawMarkersRef.current[`measure-${poppedIdx}`].remove();
          delete activeDrawMarkersRef.current[`measure-${poppedIdx}`];
        }
        
        if (currentShapeCoords.current.length >= 2) {
          setAnnotations(prev => [...prev, {
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: 'measure',
            color: currentColor,
            strokeType: currentStrokeType,
            coordinates: [...currentShapeCoords.current]
          }]);
        }
        updateActiveDrawing({ type: 'FeatureCollection', features: [] });
        clearActiveDrawMarkers();
        setActiveDistance(null);
      }

      if (activeTool === 'route' && isDrawing.current) {
        e.preventDefault();
        
        const finishRoute = () => {
          isDrawing.current = false;
          if (currentShapeCoords.current.length >= 2) {
            setAnnotations(prev => [...prev, {
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              type: 'route',
              color: currentColor,
              strokeType: currentStrokeType,
              coordinates: [...currentShapeCoords.current],
              routeGeometry: { ...routeGeometryRef.current, coordinates: [...routeGeometryRef.current.coordinates] },
              routeMode: routeMode,
              routeLegs: [...routeLegsRef.current]
            }]);
          }
          updateActiveDrawing({ type: 'FeatureCollection', features: [] });
          clearActiveDrawMarkers();
          currentDrawSessionRef.current = (currentDrawSessionRef.current || 0) + 1;
        };

        if (pendingFetchesRef.current > 0) {
          const checkInterval = setInterval(() => {
            if (pendingFetchesRef.current === 0) {
              clearInterval(checkInterval);
              finishRoute();
            }
          }, 50);
        } else {
          finishRoute();
        }
      }
    };

    // Disable double click zoom when using polygon or measure or route tool to prevent interference
    if (activeTool === 'polygon' || activeTool === 'measure' || activeTool === 'route') {
      map.doubleClickZoom.disable();
    } else {
      map.doubleClickZoom.enable();
    }

    const onTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length > 1) return;
      if (activeTool === 'paint' || activeTool === 'circle' || activeTool === 'arrow') {
        e.preventDefault();
        onMouseDown(e as unknown as maplibregl.MapMouseEvent);
      }
    };

    const onTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length > 1) return;
      if (isDrawing.current && (activeTool === 'paint' || activeTool === 'circle' || activeTool === 'arrow')) {
        e.preventDefault();
        onMouseMove(e as unknown as maplibregl.MapMouseEvent);
      }
    };

    const onTouchEnd = (e: maplibregl.MapTouchEvent) => {
      if (isDrawing.current && (activeTool === 'paint' || activeTool === 'circle' || activeTool === 'arrow')) {
        // In some cases touchend might lack a reliable lngLat, but Mapbox usually provides it based on changedTouches.
        // We ensure it falls back if needed.
        const fakeEvent = e as unknown as maplibregl.MapMouseEvent;
        if (!fakeEvent.lngLat && currentShapeCoords.current.length > 0) {
           const last = currentShapeCoords.current[currentShapeCoords.current.length - 1];
           fakeEvent.lngLat = new maplibregl.LngLat(last[0], last[1]);
        } else if (!fakeEvent.lngLat && activeTool === 'circle' && circleCenter.current) {
           // fallback for circle
           fakeEvent.lngLat = new maplibregl.LngLat(circleCenter.current[0], circleCenter.current[1]);
        } else if (!fakeEvent.lngLat && activeTool === 'arrow' && arrowStart.current) {
           // fallback for arrow (draws a dot basically)
           fakeEvent.lngLat = new maplibregl.LngLat(arrowStart.current[0], arrowStart.current[1]);
        }
        onMouseUp(fakeEvent);
      }
    };

    map.on('click', onClick);
    map.on('mousedown', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('mouseup', onMouseUp);
    map.on('dblclick', onDblClick);
    map.on('touchstart', onTouchStart);
    map.on('touchmove', onTouchMove);
    map.on('touchend', onTouchEnd);

    return () => {
      map.off('click', onClick);
      map.off('mousedown', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('mouseup', onMouseUp);
      map.off('dblclick', onDblClick);
      map.off('touchstart', onTouchStart);
      map.off('touchmove', onTouchMove);
      map.off('touchend', onTouchEnd);
    };
  }, [mapLoaded, activeTool, currentColor, currentStrokeType, currentFillOpacity, annotations, setAnnotations, activeGeojsonLayerId, setActiveGeojsonLayerId, setSelectedGeojsonFeatureId, selectedAircraftId, settings.layers, selectedIconId, routeMode, settings.googleMapsToken]);

}
