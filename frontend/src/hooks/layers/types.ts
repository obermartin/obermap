import type { AppSettings, MapLayer } from '../../types';

export interface BaseLayerVisibilityProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  mapStyleLoaded: boolean;
  mapStyleTick?: number;
  settings: AppSettings;
  layers: (MapLayer & { _effectiveOpacityVisible?: boolean })[];
  firstAdminId: string | undefined;
  firstSymbolId: string | undefined;
  fallbackFont: string[];
}
