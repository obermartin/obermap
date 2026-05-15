import type { Theme } from './labels/LabelMarkerManager';

export type ToolType = 'none' | 'label' | 'highlight' | 'paint' | 'polygon' | 'circle' | 'measure' | 'icon' | 'arrow' | 'route' | 'headline';
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
  secondaryText?: string;
  template?: string;
  theme?: Theme;
  radius?: number;
  iconId?: string;
  routeGeometry?: any;
  routeMode?: RouteMode;
  routeLegs?: { distance: number; duration: number }[];
  animationTriggerId?: string;
  hideAnimationTriggerId?: string;
  screenPosition?: { x: number; y: number };
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
  type: 'geojson' | 'raster' | 'satellite' | 'split' | 'deepstate' | 'empty-slot' | 'flights' | 'vessels' | 'wind' | 'weather_forecast';
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

  // Weather forecast layer specific
  showTemperature?: boolean;
  showPrecipitation?: boolean;
  weatherForecastTime?: string; // the time step to fetch
}

export interface IconCategory {
  id: string;
  name: string;
  icons: { id: string; svg: string }[];
}

export interface AppSettings {
  title?: string;
  mapToken: string;
  mapStyle: string;
  defaultView: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
  colorPalette: string[];
  icons: IconCategory[];
  labelTemplates?: {
    highlightLabelTemplate?: string;
    regularLabelTemplate?: string;
    availableTemplates: string[];
    theme?: Theme;
  };
  labelDensity?: number;
  layers: MapLayer[];
  openSkyCredentials?: { clientId: string; clientSecret: string };
  aisstreamCredentials?: { apiKey: string };
  googleMapsToken?: string;
  presetLayers?: MapLayer[];
  animationDuration?: number;
  labelAnimationDuration?: number;
}

export interface AppState {
  activeTool: ToolType;
  currentColor: string;
  annotations: Annotation[];
}
