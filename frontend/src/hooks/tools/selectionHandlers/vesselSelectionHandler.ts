import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../../../types';
import type { MutableRefObject } from 'react';

export const handleVesselSelection = (
  e: maplibregl.MapMouseEvent,
  map: maplibregl.Map,
  settings: AppSettings,
  activeVesselMmsiRef: MutableRefObject<string | null>,
  vesselPopupRef: MutableRefObject<maplibregl.Popup | null>,
  vesselsRef: MutableRefObject<Map<string, any>>,
  getMmsiFlagHtml: (mmsiStr: string) => string
): boolean => {
  let clickedVesselMmsi: string | null = null;
  try {
    const vesselLayers = settings.layers.filter(l => l.type === 'vessels').map(l => `dynamic-layer-${l.id}`);
    if (vesselLayers.length > 0) {
      const vesselFeatures = map.queryRenderedFeatures(e.point, { layers: vesselLayers });
      if (vesselFeatures.length > 0) {
        clickedVesselMmsi = vesselFeatures[0].properties?.mmsi || null;
      }
    }
  } catch (err) {}

  if (clickedVesselMmsi) {
    if (activeVesselMmsiRef.current === clickedVesselMmsi) {
      activeVesselMmsiRef.current = null;
      window.dispatchEvent(new CustomEvent('vesselSelected', { detail: null }));
      if (vesselPopupRef.current) {
        vesselPopupRef.current.remove();
        vesselPopupRef.current = null;
      }
      const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
      if (trackSource) trackSource.setData({ type: 'FeatureCollection', features: [] });
    } else {
      activeVesselMmsiRef.current = clickedVesselMmsi;
      window.dispatchEvent(new CustomEvent('vesselSelected', { detail: clickedVesselMmsi }));
      const v = vesselsRef.current.get(clickedVesselMmsi);
      if (v && v.lat != null && v.lon != null) {
        if (!vesselPopupRef.current) {
          vesselPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
            .setLngLat([v.lon, v.lat])
            .addTo(map);
        } else {
          vesselPopupRef.current.setLngLat([v.lon, v.lat]);
        }
        const style = document.getElementById('flight-popup-style') || document.createElement('style');
        style.id = 'flight-popup-style';
        style.innerHTML = '.flight-popup .maplibregl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .maplibregl-popup-tip { border-top-color: #09090b; }';
        if (!document.getElementById('flight-popup-style')) document.head.appendChild(style);
        
        const spd = v.sog != null ? Math.round(v.sog) + 'kn' : 'N/A';
        const hdg = v.heading != null ? Math.round(v.heading) + '°' : 'N/A';
        const flag = getMmsiFlagHtml(v.mmsi);
        const popupHtml = `
          <div style="background-color: #09090b; padding: 12px; border-radius: 0; color: white; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; min-width: 180px; text-transform: uppercase;">
            <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #ffffff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.name || 'UNKNOWN'}</span>
              <span style="font-size: 16px; margin-left: 8px;">${flag}</span>
            </div>
            <div style="display: grid; grid-template-columns: 40px 1fr; gap: 6px; font-weight: 500;">
              <span style="color: rgba(255,255,255,0.5);">MMSI:</span> <span style="text-align: right; font-family: monospace;">${v.mmsi}</span>
              <span style="color: rgba(255,255,255,0.5);">CALL:</span> <span style="text-align: right; font-family: monospace;">${v.callSign || 'N/A'}</span>
              <span style="color: rgba(255,255,255,0.5);">DEST:</span> <span style="text-align: right; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v.destination || 'N/A'}</span>
              <span style="color: rgba(255,255,255,0.5);">SPD:</span> <span style="text-align: right; font-family: monospace;">${spd}</span>
              <span style="color: rgba(255,255,255,0.5);">HDG:</span> <span style="text-align: right; font-family: monospace;">${hdg}</span>
            </div>
          </div>
        `;
        vesselPopupRef.current.setHTML(popupHtml);

        const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
        if (trackSource && v.track && v.track.length > 1) {
          trackSource.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: v.track }, properties: {} }]
          });
        } else if (trackSource) {
          trackSource.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    }
    return true;
  } else {
    if (activeVesselMmsiRef.current) {
      activeVesselMmsiRef.current = null;
      window.dispatchEvent(new CustomEvent('vesselSelected', { detail: null }));
      if (vesselPopupRef.current) {
        vesselPopupRef.current.remove();
        vesselPopupRef.current = null;
      }
      const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
      if (trackSource) trackSource.setData({ type: 'FeatureCollection', features: [] });
    }
  }

  return false;
};
