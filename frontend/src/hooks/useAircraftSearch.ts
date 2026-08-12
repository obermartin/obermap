import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
interface UseAircraftSearchProps {
  map: maplibregl.Map | null;
  settings: any;
  setSelectedAircraftId: (id: string | null) => void;
}

export const useAircraftSearch = ({
  map,
  settings,
  setSelectedAircraftId,
}: UseAircraftSearchProps) => {
  // Handle searchAircraft
  useEffect(() => {
    const handleSearchAircraft = (async (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (!map) return;
      const searchTerm = customEvent.detail.toUpperCase();
      
      const flightsLayer = settings.layers.find((l: any) => l.type === 'flights');
      if (!flightsLayer) return;
      const sourceId = `dynamic-source-${flightsLayer.id}`;
      
      // Try to find it in the current map source data first
      const features = map.querySourceFeatures(sourceId);
      const found = features.find(f => 
        (f.properties?.callsign && f.properties.callsign.toUpperCase().includes(searchTerm)) || 
        (f.properties?.icao24 && f.properties.icao24.toUpperCase() === searchTerm)
      );

      if (found && found.geometry.type === 'Point') {
        const coords = found.geometry.coordinates as [number, number];
        map.flyTo({ center: coords, zoom: 8 });
        setSelectedAircraftId(found.properties?.icao24 || null);
        window.dispatchEvent(new CustomEvent('searchAircraftResult', { detail: { found: true } }));
      } else {
        window.dispatchEvent(new CustomEvent('searchAircraftResult', { detail: { found: false } }));
      }
    }) as EventListener;

    window.addEventListener('searchAircraft', handleSearchAircraft);
    return () => window.removeEventListener('searchAircraft', handleSearchAircraft);
  }, [settings.layers, map, setSelectedAircraftId]);
};
