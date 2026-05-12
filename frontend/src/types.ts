export type ToolType = 'none' | 'label' | 'highlight' | 'paint' | 'polygon' | 'circle' | 'measure' | 'icon' | 'arrow' | 'route';
export type StrokeType = 'solid' | 'dashed' | 'dotted';
export type RouteMode = 'driving' | 'walking' | 'train';

export interface Annotation {
  id: string;
  type: ToolType;
  color: string;
  strokeType?: StrokeType;
  fillOpacity?: number;
  coordinates?: any;
  polygonGeometry?: any;
  text?: string;
  radius?: number;
  iconId?: string;
  routeGeometry?: any;
  routeMode?: RouteMode;
  routeLegs?: { distance: number; duration: number }[];
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
  showWindLegend?: boolean;
  showWindTimeline?: boolean;
  windParticleSizeBySpeed?: boolean;
  windParticleSpeedBySpeed?: boolean;
  windParticleTrailBySpeed?: boolean;
  windParticleColorBySpeed?: boolean;
}

export interface IconCategory {
  id: string;
  name: string;
  icons: { id: string; svg: string }[];
}

export interface AppSettings {
  title?: string;
  mapboxToken: string;
  mapboxStyle: string;
  defaultView: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
  colorPalette: string[];
  icons: IconCategory[];
  labelDensity?: number;
  layers: MapLayer[];
  openSkyCredentials?: { clientId: string; clientSecret: string };
  aisstreamCredentials?: { apiKey: string };
  googleMapsToken?: string;
}

export interface AppState {
  activeTool: ToolType;
  currentColor: string;
  annotations: Annotation[];
}
