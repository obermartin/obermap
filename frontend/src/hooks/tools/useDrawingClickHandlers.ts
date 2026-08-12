import { useEffect, useRef } from 'react';

import maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import anyAscii from 'any-ascii';
import { transliterateToGerman } from '../../utils/mapUtils';
import type { Annotation, AppSettings, ToolType } from '../../types';

interface UseDrawingClickHandlersProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  activeTool: ToolType;
  currentColor: string;
  currentStrokeType: 'solid' | 'dashed' | 'dotted';
  currentFillOpacity: number | null;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  settings: AppSettings;
  selectedIconId: string | null;
  isToolbarOpen: boolean;
  clickedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  setLabelPrompt: React.Dispatch<React.SetStateAction<{ lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null>>;
  setHeadlinePrompt: React.Dispatch<React.SetStateAction<{ id?: string; initialPrimary?: string; initialSecondary?: string } | null>> | undefined;
  mapRef: React.RefObject<maplibregl.Map | null>;
  handleSelectionClick: (e: maplibregl.MapMouseEvent) => boolean;
}

export const useDrawingClickHandlers = ({
  map,
  mapLoaded,
  activeTool,
  currentColor,
  currentStrokeType,
  currentFillOpacity,
  annotations,
  setAnnotations,
  settings,
  selectedIconId,
  isToolbarOpen,
  clickedAnnotationId,
  setSelectedAnnotationId,
  setLabelPrompt,
  setHeadlinePrompt,
  mapRef,
  handleSelectionClick
}: UseDrawingClickHandlersProps) => {

  const terrestrialCountriesRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !mapLoaded) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      // If the selection hook consumes this click (e.g., clicking on a custom icon/label to select it), stop here.
      const consumedBySelection = handleSelectionClick(e);
      if (consumedBySelection) return;

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
          
          if (type === 'get') return feature.properties?.[expr[1]];
          if (type === 'has') return feature.properties?.[expr[1]] !== undefined;
          if (type === '==') return evaluateExpression(expr[1], zoom, feature) === evaluateExpression(expr[2], zoom, feature);
          if (type === '!=') return evaluateExpression(expr[1], zoom, feature) !== evaluateExpression(expr[2], zoom, feature);
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
          if (type === 'zoom') return zoom;
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
          return null; 
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
          } catch (err) {
            return true; 
          }
        });
        
        const symbolFeature = validSymbolFeatures.sort((a, b) => {
          const aId = a.layer?.id.toLowerCase() || '';
          const bId = b.layer?.id.toLowerCase() || '';
          
          const getScore = (id: string) => {
            if (id.includes('poi')) return 4;
            if (id.includes('settlement') || id.includes('place') || id.includes('city') || id.includes('town')) return 3;
            if (id.includes('water') || id.includes('natural')) return 2;
            if (id.includes('state') || id.includes('admin-1') || id.includes('province')) return 1;
            if (id.includes('country') || id.includes('admin-0')) return 0;
            return 2;
          };
          return getScore(bId) - getScore(aId);
        })[0];
        
        if (symbolFeature) {
          const props = symbolFeature.properties || {};
          const nameNative = props.name || '';
          const hasCyrillic = /[А-Яа-яЁёІіЇїЄєҐґ]/.test(nameNative);
          
          let name = props.name_de || props.name_en || props.name_int || props.name || '';
          if (hasCyrillic) {
            const isRussian = props.name_ru && props.name === props.name_ru && props.name !== props.name_uk;
            name = transliterateToGerman(nameNative, isRussian);
          } else if (!props.name_de && !props.name_en && !props.name_int && nameNative) {
            const needsTransliteration = /[^\u0000-\u024F\u1E00-\u1EFF]/.test(nameNative);
            if (needsTransliteration) name = anyAscii(nameNative);
          }

          if (name) name = name.replace(/[^\u0000-\u024F\u1E00-\u1EFF]/g, '').trim();
          
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
        } else if (clickedAnnotationId && isToolbarOpen) {
          setSelectedAnnotationId(clickedAnnotationId);
        } else {
          const fetchCountry = async () => {
            try {
              document.body.style.cursor = 'wait';
              
              let terrestrialGeometry = null;
              if (!terrestrialCountriesRef.current) {
                try {
                  const cRes = await fetch('/countries.geo.json');
                  terrestrialCountriesRef.current = await cRes.json();
                } catch (err) {
                  console.error("Failed to load terrestrial countries", err);
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

                if (name) name = name.replace(/[^\u0000-\u024F\u1E00-\u1EFF]/g, '').trim();
                
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
    };

    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
    };
  }, [
    map, mapLoaded, activeTool, currentColor, currentStrokeType, currentFillOpacity, 
    annotations, settings, selectedIconId, isToolbarOpen, clickedAnnotationId, 
    mapRef, handleSelectionClick, setAnnotations, setLabelPrompt, setHeadlinePrompt, setSelectedAnnotationId
  ]);
};
