export type ToolType = 'none' | 'label' | 'highlight' | 'paint' | 'polygon' | 'circle' | 'measure' | 'icon';

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
  type: 'geojson' | 'raster' | 'satellite';
  visible: boolean;
  data?: any; // For GeoJSON
  url?: string; // For XYZ/WMTS
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
}

export interface AppState {
  activeTool: ToolType;
  currentColor: string;
  annotations: Annotation[];
}
