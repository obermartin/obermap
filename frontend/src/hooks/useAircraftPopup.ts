import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { getFlagHtml } from '../utils/mapUtils';
import type { AppSettings } from '../types';

interface UseAircraftPopupProps {
  map: maplibregl.Map | null;
  selectedAircraftId: string | null;
  settings: AppSettings;
  aircraftPopupRef: React.MutableRefObject<maplibregl.Popup | null>;
  selectedAircraftMetaRef: React.MutableRefObject<any>;
}

export const useAircraftPopup = ({
  map,
  selectedAircraftId,
  settings,
  aircraftPopupRef,
  selectedAircraftMetaRef,
}: UseAircraftPopupProps) => {
  // Immediate popup rendering for selected aircraft
  useEffect(() => {
    if (!map || !selectedAircraftId) return;
    const flightsLayer = settings.layers.find((l: any) => l.type === 'flights');
    if (!flightsLayer || !flightsLayer.visible) return;
    
    if (flightsLayer.is3DMode) {
      if (aircraftPopupRef.current) {
        aircraftPopupRef.current.remove();
        aircraftPopupRef.current = null;
      }
      return;
    }

    const sourceId = `dynamic-source-${flightsLayer.id}`;
    const features = map.querySourceFeatures(sourceId);
    const found = features.find(f => f.properties?.icao24 === selectedAircraftId);
    if (!found || found.geometry.type !== 'Point') return;
    
    const [lon, lat] = found.geometry.coordinates as [number, number];
    const callsign = found.properties?.callsign || '';
    
    if (!aircraftPopupRef.current) {
      aircraftPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
        .setLngLat([lon, lat])
        .addTo(map);
    } else {
      aircraftPopupRef.current.setLngLat([lon, lat]);
    }
    
    const meta = selectedAircraftMetaRef.current?.icao24 === selectedAircraftId ? selectedAircraftMetaRef.current : {};
    const flag = getFlagHtml(found.properties?.country);
    const alt = found.properties?.altitude !== undefined ? Math.round(found.properties.altitude) + 'm' : 'N/A';
    const spd = found.properties?.velocity !== undefined ? Math.round(found.properties.velocity * 3.6) + 'km/h' : 'N/A';
    
    const popupHtml = `
      <div style="background-color: #09090b; padding: 12px; border-radius: 0; color: white; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; min-width: 180px; text-transform: uppercase;">
        <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #ffffff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">
          <span>${callsign || 'UNKNOWN'}</span>
          <span style="font-size: 16px;">${flag}</span>
        </div>
        <div style="display: grid; grid-template-columns: 40px 1fr; gap: 6px; font-weight: 500;">
          <span style="color: rgba(255,255,255,0.5);">REG:</span> <span style="text-align: right; font-family: monospace;">${meta.registration || 'Loading...'}</span>
          <span style="color: rgba(255,255,255,0.5);">TYPE:</span> <span style="text-align: right; font-family: monospace;">${meta.type || 'Loading...'}</span>
          <span style="color: rgba(255,255,255,0.5);">RTE:</span> <span style="text-align: right; font-family: monospace;">${meta.route || 'Loading...'}</span>
          <span style="color: rgba(255,255,255,0.5);">ALT:</span> <span style="text-align: right; font-family: monospace;">${alt}</span>
          <span style="color: rgba(255,255,255,0.5);">SPD:</span> <span style="text-align: right; font-family: monospace;">${spd}</span>
        </div>
      </div>
    `;
    const style = document.getElementById('flight-popup-style') || document.createElement('style');
    style.id = 'flight-popup-style';
    style.innerHTML = '.flight-popup .maplibregl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .maplibregl-popup-tip { border-top-color: #09090b; }';
    if (!document.getElementById('flight-popup-style')) document.head.appendChild(style);
    
    aircraftPopupRef.current.setHTML(popupHtml);
  }, [selectedAircraftId, settings.layers, map, aircraftPopupRef, selectedAircraftMetaRef]);
};
