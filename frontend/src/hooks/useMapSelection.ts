import { useState, useEffect, useCallback } from 'react';
import type { AppSettings } from '../types';
import maplibregl from 'maplibre-gl';

interface UseMapSelectionProps {
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  mapLoaded: boolean;
  settings: AppSettings;
  activeGeojsonLayerId: string | null;
  selectedGeojsonFeatureId: string | number | null;
}

export const useMapSelection = ({
  mapRef,
  mapLoaded,
  settings,
  activeGeojsonLayerId,
  selectedGeojsonFeatureId
}: UseMapSelectionProps) => {
  const [selectedAircraftId, setSelectedAircraftIdState] = useState<string | null>(null);
  const [selectedVesselMmsi, setSelectedVesselMmsi] = useState<string | null>(null);

  const setSelectedAircraftId = useCallback((id: string | null) => {
    setSelectedAircraftIdState(id);
    window.dispatchEvent(new CustomEvent('aircraftSelected', { detail: id }));
  }, []);

  useEffect(() => {
    const vesselHandler = (e: CustomEvent<string | null>) => setSelectedVesselMmsi(e.detail);
    window.addEventListener('vesselSelected', vesselHandler as EventListener);
    return () => window.removeEventListener('vesselSelected', vesselHandler as EventListener);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource('selected-geojson-feature') as maplibregl.GeoJSONSource;
    if (!source) return;

    if (activeGeojsonLayerId && selectedGeojsonFeatureId) {
      const layer = settings.layers.find(l => l.id === activeGeojsonLayerId);
      if (layer && layer.data && layer.data.features) {
        const feature = layer.data.features.find((f: any) => f.properties?.id === selectedGeojsonFeatureId);
        if (feature) {
          source.setData({ type: 'FeatureCollection', features: [feature] });
          return;
        }
      }
    }
    
    // Clear selection
    source.setData({ type: 'FeatureCollection', features: [] });
  }, [activeGeojsonLayerId, selectedGeojsonFeatureId, settings.layers, mapLoaded, mapRef]);

  return {
    selectedAircraftId,
    setSelectedAircraftId,
    selectedVesselMmsi
  };
};
