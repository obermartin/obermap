import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../types';

import { useCycloneStream } from './disasters/useCycloneStream';
import { useEarthquakeStream } from './disasters/useEarthquakeStream';
import { useVolcanoStream } from './disasters/useVolcanoStream';
import { useCemsRapidMapping } from './disasters/useCemsRapidMapping';

export interface DisasterStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  selectedCycloneId: any;
  cycloneTimelinePercent: number;
  setCycloneTimelinePercent: React.Dispatch<React.SetStateAction<number>>;
  selectedEarthquake: any;
  selectedVolcano: any;
  selectedEarthquakeShakemap: any;
  selectedCemsEarthquakeFeatures: any;
  setSelectedCemsEarthquakeFeatures: (val: any) => void;
  selectedVolcanoPolygon: any;
  activeDrawMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
  selectionMarkersRef: React.MutableRefObject<{ [id: string]: maplibregl.Marker }>;
}

export const useDisasterStream = (props: DisasterStreamProps) => {
  const {
    map,
    mapLoaded,
    settings,
    selectedCycloneId,
    cycloneTimelinePercent,
    setCycloneTimelinePercent,
    selectedEarthquake,
    selectedVolcano,
    selectedEarthquakeShakemap,
    selectedCemsEarthquakeFeatures,
    setSelectedCemsEarthquakeFeatures,
    selectedVolcanoPolygon,
    activeDrawMarkersRef,
    selectionMarkersRef
  } = props;

  // 1. Cyclones
  const { cycloneGeometryRef } = useCycloneStream({
    map,
    mapLoaded,
    settings,
    selectedCycloneId,
    cycloneTimelinePercent,
    setCycloneTimelinePercent
  });

  // 2. Earthquakes
  useEarthquakeStream({
    map,
    mapLoaded,
    settings,
    selectedEarthquake,
    selectedEarthquakeShakemap,
    activeDrawMarkersRef,
    selectionMarkersRef
  });

  // 3. Volcanoes
  useVolcanoStream({
    map,
    mapLoaded,
    settings,
    selectedVolcano,
    selectedVolcanoPolygon,
    selectionMarkersRef
  });

  // 4. CEMS Rapid Mapping
  useCemsRapidMapping({
    map,
    mapLoaded,
    settings,
    selectedEarthquake,
    selectedCemsEarthquakeFeatures,
    setSelectedCemsEarthquakeFeatures
  });

  // Export GeoJSON Listener (Global orchestration)
  useEffect(() => {
    const handleExport = (e: CustomEvent) => {
      if (!e.detail?.type || !e.detail?.id) return;
      import('../utils/exportUtils').then(({ downloadGeoJSON, processCycloneGeometry, processVolcanoGeometry, processEarthquakeGeometry, processCemsGeometry }) => {
        if (e.detail.type === 'gdacs_earthquakes' && selectedEarthquake?.id === e.detail.id && selectedEarthquakeShakemap) {
          const processedEarthquake = processEarthquakeGeometry(selectedEarthquakeShakemap);
          downloadGeoJSON(processedEarthquake, `earthquake_shakemap_${e.detail.id}.geojson`);
        } else if (e.detail.type === 'gdacs_volcanoes' && selectedVolcano?.id === e.detail.id && selectedVolcanoPolygon) {
          const processedVolcano = processVolcanoGeometry(selectedVolcanoPolygon);
          downloadGeoJSON(processedVolcano, `volcano_danger_zone_${e.detail.id}.geojson`);
        } else if (e.detail.type === 'gdacs_cyclones' && selectedCycloneId?.id === e.detail.id && cycloneGeometryRef.current) {
          const processedGeometry = processCycloneGeometry(cycloneGeometryRef.current);
          downloadGeoJSON(processedGeometry, `hurricane_path_${e.detail.id}.geojson`);
        } else if (e.detail.type === 'cems_earthquake' && e.detail.id === selectedEarthquake?.id && selectedCemsEarthquakeFeatures) {
          const processedCems = processCemsGeometry(selectedCemsEarthquakeFeatures);
          downloadGeoJSON(processedCems, `cems_earthquake_damage_${e.detail.id}.geojson`);
        }
      });
    };
    window.addEventListener('requestGeoJsonExport', handleExport as EventListener);
    return () => window.removeEventListener('requestGeoJsonExport', handleExport as EventListener);
  }, [
    selectedEarthquake,
    selectedEarthquakeShakemap,
    selectedVolcano,
    selectedVolcanoPolygon,
    selectedCycloneId,
    selectedCemsEarthquakeFeatures,
    cycloneGeometryRef
  ]);
};
