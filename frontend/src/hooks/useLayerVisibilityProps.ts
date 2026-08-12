import type { AppSettings } from '../types';

export interface LayerVisibilityProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  mapStyleLoaded: boolean;
  mapStyleTick?: number;
  settings: AppSettings;
  annotations: any[];
  activeTool: string | null;
  revealedTriggers: Set<string>;
  hiddenTriggers: Set<string>;
  selectedAircraftId: string | null;
  selectedVesselMmsi: string | null;
  selectedWeatherTime: string | null;
  weatherValidTimes: string[];
  selectedEarthquake: any | null;
  selectedVolcano: any | null;
  selectedEarthquakeShakemap: any | null;
  selectedVolcanoPolygon: any | null;
  selectedCemsEarthquake: any | null;
  selectedCemsEarthquakeFeatures: any[] | null;
  weatherForecastLayerIdsRef: React.MutableRefObject<string[]>;
  weatherForecastSourceIdsRef: React.MutableRefObject<string[]>;
  lastActiveWeatherTimeRef: React.MutableRefObject<string | null>;
  weatherAllValidTimesRef: React.MutableRefObject<string[]>;
  windLastFetchRef: React.MutableRefObject<number>;
}
