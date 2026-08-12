import { useEffect, useState, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../types';
import along from '@turf/along';
import turfLength from '@turf/length';
import lineSlice from '@turf/line-slice';
import { safeSetFilter } from '../../utils/mapUtils';

export interface UseCycloneStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  selectedCycloneId: any;
  cycloneTimelinePercent: number;
  setCycloneTimelinePercent: (val: number) => void;
}

export const useCycloneStream = ({
  map,
  mapLoaded,
  settings,
  selectedCycloneId,
  cycloneTimelinePercent,
  setCycloneTimelinePercent
}: UseCycloneStreamProps) => {
  const [cycloneRawData, setCycloneRawData] = useState<any>(null);
  const cycloneGeometryRef = useRef<any>(null);

  // Update cyclone point filter to hide selected cyclone point
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    settings.layers.forEach(layer => {
      if (layer.type === 'gdacs_cyclones') {
        const layerId = `dynamic-layer-${layer.id}`;
        if (map.getLayer(layerId)) {
          if (selectedCycloneId) {
            safeSetFilter(map, layerId, ['!=', ['to-string', ['get', 'eventid']], selectedCycloneId.id]);
          } else {
            safeSetFilter(map, layerId, null);
          }
        }
      }
    });
  }, [selectedCycloneId, mapLoaded, settings.layers]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('exportDataReady', {
      detail: { type: 'gdacs_cyclones', id: selectedCycloneId?.id, ready: !!cycloneGeometryRef.current && cycloneGeometryRef.current.features?.length > 0 }
    }));
  }, [selectedCycloneId, cycloneGeometryRef.current]);

  // Fetch geometry when selectedCycloneId changes
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    const source = map.getSource('selected-cyclone-geometry') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (!selectedCycloneId) {
      cycloneGeometryRef.current = null;
      window.dispatchEvent(new CustomEvent('exportDataReady', {
        detail: { type: 'gdacs_cyclones', id: undefined, ready: false }
      }));
      source.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const fetchGeometry = async () => {
      try {
        const cycloneLayer = settings.layers.find(l => l.type === 'gdacs_cyclones');
        if (!cycloneLayer || !cycloneLayer.visible) {
          source.setData({ type: 'FeatureCollection', features: [] });
          return;
        }

        const rawUrl = `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=TC&eventid=${selectedCycloneId.id}&episodeid=${selectedCycloneId.ep}`;
        const url = `./api.php?action=proxy_gdacs&url=${encodeURIComponent(rawUrl)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch cyclone geometry');
        
        const data = await res.json();
        if (data && Array.isArray(data.features)) {
          cycloneGeometryRef.current = data;
          setCycloneRawData(data);
          setCycloneTimelinePercent(100);
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'gdacs_cyclones', id: selectedCycloneId?.id, ready: true }
          }));
          source.setData(data);
        } else {
          cycloneGeometryRef.current = null;
          setCycloneRawData(null);
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'gdacs_cyclones', id: selectedCycloneId?.id, ready: 'empty' }
          }));
          source.setData({ type: 'FeatureCollection', features: [] });
        }
      } catch (err) {
        console.error('Error fetching cyclone geometry:', err);
        cycloneGeometryRef.current = null;
        setCycloneRawData(null);
        window.dispatchEvent(new CustomEvent('exportDataReady', {
          detail: { type: 'gdacs_cyclones', id: selectedCycloneId?.id, ready: 'empty' }
        }));
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    };

    fetchGeometry();
  }, [selectedCycloneId, mapLoaded, settings.layers]);

  // Effect to process and render the cyclone track based on the timeline slider
  useEffect(() => {
    if (!map || !mapLoaded || !selectedCycloneId || !cycloneRawData) return;
    
    const source = map.getSource('selected-cyclone-geometry') as maplibregl.GeoJSONSource;
    if (!source) return;

    try {
      // 1. Extract and combine all LineString segments into one continuous track
      const lineFeatures = cycloneRawData.features.filter((f: any) => f.geometry.type === 'LineString');
      
      const segments = lineFeatures.map((f: any) => f.geometry.coordinates);
      const allCoordinates: number[][] = [];
      
      if (segments.length > 0) {
        const isSamePoint = (p1: number[], p2: number[]) => Math.abs(p1[0] - p2[0]) < 0.01 && Math.abs(p1[1] - p2[1]) < 0.01;
        const stitched = [...segments[0]];
        const used = new Set([0]);
        
        let added = true;
        while(added) {
          added = false;
          for (let i = 1; i < segments.length; i++) {
            if (used.has(i)) continue;
            const seg = segments[i];
            
            // Check if seg connects to the end of stitched
            if (isSamePoint(stitched[stitched.length - 1], seg[0])) {
              stitched.push(...seg.slice(1));
              used.add(i);
              added = true;
            } 
            // Check if seg connects to the beginning of stitched
            else if (isSamePoint(stitched[0], seg[seg.length - 1])) {
              stitched.unshift(...seg.slice(0, -1));
              used.add(i);
              added = true;
            }
          }
        }

        // Unwrap longitudes for Mapbox to avoid drawing across the entire map at the date line
        let prevLon: number | null = null;
        stitched.forEach(coord => {
          let lon = coord[0];
          let lat = coord[1];
          if (prevLon !== null) {
            while (lon - prevLon > 180) lon -= 360;
            while (lon - prevLon < -180) lon += 360;
          }
          prevLon = lon;
          
          if (allCoordinates.length === 0) {
            allCoordinates.push([lon, lat]);
          } else {
            const last = allCoordinates[allCoordinates.length - 1];
            if (last[0] !== lon || last[1] !== lat) {
              allCoordinates.push([lon, lat]);
            }
          }
        });
      }

      if (allCoordinates.length < 2) {
        // Not enough data for a track, just render whatever we have
        source.setData(cycloneRawData);
        return;
      }

      const masterTrack = {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: allCoordinates
        },
        properties: lineFeatures[0]?.properties || {}
      };

      const trackLength = turfLength(masterTrack, { units: 'kilometers' });
      const currentDistance = trackLength * (cycloneTimelinePercent / 100);

      // 2. Interpolate current point
      const currentPoint = along(masterTrack, currentDistance, { units: 'kilometers' });
      // Change its class to Point_Centroid so it matches the layer filter for rendering the circle
      currentPoint.properties = { ...masterTrack.properties, Class: 'Point_Centroid' };

      // 3. Slice the track from start to current point
      let currentTrack;
      if (cycloneTimelinePercent <= 0) {
        // At 0%, track is just a point or very short line, so don't render a track
        currentTrack = { ...masterTrack, geometry: { type: 'LineString', coordinates: [] } };
      } else if (cycloneTimelinePercent >= 100) {
        currentTrack = masterTrack;
      } else {
        const startPoint = { type: 'Feature', geometry: { type: 'Point', coordinates: allCoordinates[0] } };
        currentTrack = lineSlice(startPoint as any, currentPoint, masterTrack);
      }

      // Restore class for the track
      currentTrack.properties = { ...currentTrack.properties, Class: 'Line_Line_1' };

      // 4. Handle the Cone of Uncertainty
      const coneFeature = cycloneRawData.features.find((f: any) => f.properties?.Class === 'Poly_Cones');
      
      const featuresToRender: any[] = [currentPoint, currentTrack];
      if (coneFeature) {
        // We render the cone and adjust its opacity in paint properties dynamically,
        // but since we can't easily animate layer properties here without creating a new layer,
        // we'll inject a dynamic property into the GeoJSON feature!
        const coneOpacity = Math.max(0, (cycloneTimelinePercent - 80) / 20); // fade in from 80% to 100%
        coneFeature.properties = { ...coneFeature.properties, _dynamicOpacity: coneOpacity };
        featuresToRender.push(coneFeature);
      }

      source.setData({
        type: 'FeatureCollection',
        features: featuresToRender
      });
    } catch (e) {
      console.error('Error processing cyclone timeline:', e);
      source.setData(cycloneRawData);
    }
  }, [cycloneTimelinePercent, cycloneRawData, selectedCycloneId, mapLoaded]);

  return { cycloneGeometryRef };
};
