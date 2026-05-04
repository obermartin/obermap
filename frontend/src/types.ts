export type ToolType = 'none' | 'label' | 'highlight' | 'paint' | 'polygon' | 'circle' | 'measure';

export interface Annotation {
  id: string;
  type: ToolType;
  color: string;
  coordinates?: any;
  text?: string;
  radius?: number;
  view?: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
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
}

export interface AppState {
  activeTool: ToolType;
  currentColor: string;
  annotations: Annotation[];
}
