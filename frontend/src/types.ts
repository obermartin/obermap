export type ToolType = 'none' | 'label' | 'highlight' | 'paint' | 'polygon' | 'circle' | 'measure' | 'icon' | 'arrow';

export interface Annotation {
  id: string;
  type: ToolType;
  color: string;
  coordinates?: any;
  text?: string;
  radius?: number;
  iconId?: string;
  view?: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
}

export interface MapLayer {
  id: string;
  name: string;
  type: 'geojson' | 'raster' | 'satellite' | 'split' | 'deepstate' | 'empty-slot' | 'flights' | 'vessels' | 'wind';
  visible: boolean;
  data?: any; // For GeoJSON
  url?: string; // For XYZ/WMTS
  opacity?: number;
  startDate?: string;
  endDate?: string;
  isLive?: boolean;
  _isDirty?: boolean;
  _keepExistingData?: boolean;
  
  // For split containers
  splitLayers?: MapLayer[];
  splitDirection?: 'vertical' | 'horizontal';
  splitPosition?: number;
  
  // Post-processing
  contrast?: number;
  saturation?: number;
  hue?: number;
  brightness?: number;
  
  // Flight layer specific
  showCallsigns?: boolean;
  flightpathOpacity?: number;
  globalAircraftColor?: string;
  aircraftColors?: Record<string, string>;
  
  // Vessel layer specific
  globalVesselColor?: string;
  vesselColors?: Record<string, string>;

  // Wind layer specific
  windOpacity?: number;
  windColor?: string;
  windParticleSize?: number;
  windParticleTrail?: number;
  showWindParticles?: boolean;
  showWindArrows?: boolean;
  windParticleSizeBySpeed?: boolean;
  windParticleSpeedBySpeed?: boolean;
  windParticleTrailBySpeed?: boolean;
  windParticleColorBySpeed?: boolean;
}

export interface AppSettings {
  mapboxToken: string;
  mapboxStyle: string;
  defaultView: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
  colorPalette: string[];
  icons: { id: string; svg: string }[];
  labelDensity?: number;
  layers: MapLayer[];
  openSkyCredentials?: { clientId: string; clientSecret: string };
  aisstreamCredentials?: { apiKey: string };
}

export interface AppState {
  activeTool: ToolType;
  currentColor: string;
  annotations: Annotation[];
}
