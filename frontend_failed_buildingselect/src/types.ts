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
  is3DBuilding?: boolean;
  text?: string;
  secondaryText?: string;
  template?: string;
  theme?: Theme;
  radius?: number;
  screenPosition?: { x: number; y: number };
  iconId?: string;
  routeGeometry?: any;
  routeMode?: RouteMode;
  routeLegs?: { distance: number; duration: number }[];
  animationTriggerId?: string;
  hideAnimationTriggerId?: string;
  view?: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    elevation?: number;
  };
  isCentered?: boolean;
}

export interface MapLayer {
  id: string;
  name: string;
  type: 'geojson' | 'raster' | 'satellite' | 'split' | 'deepstate' | 'empty-slot' | 'flights' | 'vessels' | 'weather_forecast' | 'gdacs_earthquakes' | 'gdacs_volcanoes' | 'wildfires' | 'gdacs_cyclones' | 'nighttime' | 'cems_rapid_mapping';
  visible: boolean;
  data?: any; // For GeoJSON
  url?: string; // For XYZ/WMTS
  dataSource?: string; // For custom accreditation
  maxZoom?: number;
  opacity?: number;
  startDate?: string;
  endDate?: string;
  isLive?: boolean;

  _isDirty?: boolean;
  _keepExistingData?: boolean;
  customLayer?: boolean;
  nighttimeDate?: string; // YYYY-MM-DD
  nighttimeHour?: number; // 0-24
  useGlobalDate?: boolean;
  
  // Animation Triggers
  animationTriggerId?: string;
  hideAnimationTriggerId?: string;

  // Domain specific settings
  is3DMode?: boolean;
  
  // For split containers
  splitLayers?: MapLayer[];
  splitDirection?: 'vertical' | 'horizontal';
  splitPosition?: number;
  
  // Earthquake layer specific
  copernicusEnabled?: boolean;
  usgsDyfi10kmEnabled?: boolean;
  usgsDyfi1kmEnabled?: boolean;
  usgsLandslideEnabled?: boolean;
  usgsLiquefactionEnabled?: boolean;
  colorCodeShakemap?: boolean;
  shakemapEnabled?: boolean;
  shakemapOpacity?: number;
  copernicusOpacity?: number;
  usgsDyfi10kmOpacity?: number;
  usgsDyfi1kmOpacity?: number;
  usgsLandslideOpacity?: number;
  usgsLandslideContrast?: number;
  usgsLandslideSaturation?: number;
  usgsLandslideHue?: number;
  usgsLandslideBrightness?: number;
  usgsLiquefactionOpacity?: number;
  usgsLiquefactionContrast?: number;
  usgsLiquefactionSaturation?: number;
  usgsLiquefactionHue?: number;
  usgsLiquefactionBrightness?: number;
  
  _effectiveOpacityVisible?: boolean;

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
  showCityTemperatures?: boolean;
  showCityWeatherIcons?: boolean;
  limitCityWeatherToGermany?: boolean;
  weatherForecastTime?: string; // the time step to fetch
}

export interface IconCategory {
  id: string;
  name: string;
  icons: { id: string; svg: string }[];
}

export interface LabelTemplateVariation {
  id: string;
  name: string;
  baseTemplate: string;
}

export interface AppSettings {
  title?: string;
  isTemplate?: boolean;
  previewData?: string;
  mapStyle: string;
  enable3dTerrain?: boolean;
  terrainExaggeration?: number;
  enableHillshade?: boolean;
  hillshadeShadowOpacity?: number;
  hillshadeHighlightOpacity?: number;
  enableSky?: boolean;
  waterColor?: string;
  waterOpacity?: number;
  defaultView: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    elevation?: number;
  };
  colorPalette: string[];
  exportBasemapScale?: number;
  exportAnnotationScale?: number;
  exportScalePreview?: boolean;
  icons: IconCategory[];
  labelTemplates?: {
    highlightLabelTemplate?: string;
    regularLabelTemplate?: string;
    headlineTemplate?: string;
    availableTemplates: Array<string | { id: string; kind: string[] }>;
    hiddenTemplates?: string[];
    theme?: Theme; // Kept for legacy/global fallback
    variations?: LabelTemplateVariation[];
    savedThemes?: Record<string, Theme>;
  };
  labelDensity?: number;
  layers: MapLayer[];
  openSkyCredentials?: { clientId: string; clientSecret: string };
  aisstreamCredentials?: { apiKey: string };
  googleMapsToken?: string;
  presetLayers?: MapLayer[];
  animationDuration?: number;
  labelAnimationDuration?: number;
  hideUI?: boolean;
  replaceGothamFont?: boolean;
  exportCropSettings?: {
    landscape: { scale: number; offsetX: number; offsetY: number };
    portrait: { scale: number; offsetX: number; offsetY: number };
    square: { scale: number; offsetX: number; offsetY: number };
  };
  globalDateMode?: 'single' | 'range';
  globalStartDate?: string;
  globalEndDate?: string;
}

export interface BaseMapStyle {
  id: string;
  name: string;
  url: string;
  styleData?: string;
  previewData?: string;
}

export interface AppState {
  activeTool: ToolType;
  currentColor: string;
  annotations: Annotation[];
}
