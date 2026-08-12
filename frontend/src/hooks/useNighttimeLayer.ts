import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { getTerminatorPolygon } from '../utils/terminatorUtils';

interface UseNighttimeLayerProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: any; // AppSettings
}

export const useNighttimeLayer = ({
  map,
  mapLoaded,
  settings
}: UseNighttimeLayerProps) => {
  useEffect(() => {
    if (!map || !mapLoaded) return;
    
    const nighttimeLayer = settings.layers.find((l: any) => l.type === 'nighttime' && l.visible);
    if (!nighttimeLayer) return;
    
    const sourceId = `dynamic-source-${nighttimeLayer.id}`;
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (!source) return;

    try {
      const dateStr = nighttimeLayer.nighttimeDate || new Date().toISOString().split('T')[0];
      const hr = nighttimeLayer.nighttimeHour ?? 12;
      const hours = Math.floor(hr).toString().padStart(2, '0');
      const minutes = Math.floor((hr % 1) * 60).toString().padStart(2, '0');
      
      const dateString = `${dateStr}T${hours}:${minutes}:00`;
      
      const month = parseInt(dateStr.split('-')[1], 10);
      const isSummer = month >= 4 && month <= 10;
      const offsetStr = isSummer ? '+02:00' : '+01:00';
      const exactDate = new Date(`${dateString}${offsetStr}`);
      
      const geojson = getTerminatorPolygon(exactDate);
      source.setData(geojson);
    } catch (e) {
      console.error('Error updating nighttime layer:', e);
    }
  }, [settings.layers, mapLoaded, map]);
};
