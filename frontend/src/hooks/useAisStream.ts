import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../types';
import { getMmsiFlagHtml } from '../utils/mapUtils';

export interface AisStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  vesselsRef: React.MutableRefObject<Map<string, any>>;
  activeVesselMmsiRef: React.MutableRefObject<string | null>;
  vesselPopupRef: React.MutableRefObject<maplibregl.Popup | null>;
}

export const useAisStream = (props: AisStreamProps) => {
  const {
    map, mapLoaded, settings, vesselsRef, activeVesselMmsiRef, vesselPopupRef
  } = props;

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!map || !mapLoaded) return;

    const vesselsLayer = settings.layers.find(l => l.type === 'vessels');
    if (!vesselsLayer || !vesselsLayer.visible) {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const apiKey = settings.aisstreamCredentials?.apiKey;
    if (!apiKey) return;

    let resubTimer: ReturnType<typeof setTimeout> | null = null;
    let flushTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectDelay = 3000;
    let isDirty = false;

    const subscribe = () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const b = map.getBounds();
      if (!b) return;
      const BOUNDS_PAD = 2;
      const s = Math.max(-90, b.getSouth() - BOUNDS_PAD);
      const n = Math.min(90, b.getNorth() + BOUNDS_PAD);
      const w = Math.max(-180, b.getWest() - BOUNDS_PAD);
      const e = Math.min(180, b.getEast() + BOUNDS_PAD);
      wsRef.current.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[s, w], [n, e]]],
        FilterMessageTypes: ['PositionReport', 'ShipStaticData']
      }));
    };

    const scheduleResub = () => {
      if (resubTimer) clearTimeout(resubTimer);
      resubTimer = setTimeout(() => {
        if (wsRef.current) {
          wsRef.current.onclose = null; // Prevent the auto-reconnect loop
          wsRef.current.close();
          wsRef.current = null;
        }
        connect();
      }, 1000); // Wait 1s after map stops moving to avoid connection spam
    };

    const updateVesselPopup = (v: any) => {
      if (!vesselPopupRef.current) return;
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
      // Ensure popup styles are applied
      const style = document.getElementById('flight-popup-style') || document.createElement('style');
      style.id = 'flight-popup-style';
      style.innerHTML = '.flight-popup .maplibregl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .maplibregl-popup-tip { border-top-color: #09090b; }';
      if (!document.getElementById('flight-popup-style')) document.head.appendChild(style);
      
      vesselPopupRef.current.setHTML(popupHtml);
    };

    const startFlush = () => {
      if (flushTimer) clearInterval(flushTimer);
      flushTimer = setInterval(() => {
        if (!isDirty) return;
        isDirty = false;
        
        // Prune old vessels (10 mins)
        const now = Date.now();
        for (const [mmsi, v] of vesselsRef.current.entries()) {
          if (now - v.lastUpdate > 10 * 60 * 1000) {
            vesselsRef.current.delete(mmsi);
            isDirty = true;
          }
        }

        const features: GeoJSON.Feature[] = [];
        for (const v of vesselsRef.current.values()) {
          if (v.lat == null || v.lon == null) continue;
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [v.lon, v.lat] },
            properties: {
              mmsi: v.mmsi,
              name: v.name || v.mmsi,
              sog: v.sog ?? null,
              cog: v.cog ?? null,
              heading: v.heading ?? 0,
              navStatus: v.navStatus ?? null,
              callSign: v.callSign || null,
              destination: v.destination || null,
              shipType: v.shipType ?? null,
              icon: v.icon || 'ship-fast'
            }
          });
          
          if (vesselPopupRef.current && activeVesselMmsiRef.current === v.mmsi) {
             vesselPopupRef.current.setLngLat([v.lon, v.lat]);
             updateVesselPopup(v);
          }
        }
        
        const sourceId = `dynamic-source-${vesselsLayer.id}`;
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
        if (source) source.setData({ type: 'FeatureCollection', features });

        // Update selected vessel track
        const trackSource = map.getSource('selected-vessel-track') as maplibregl.GeoJSONSource;
        if (trackSource) {
          if (activeVesselMmsiRef.current && vesselsRef.current.has(activeVesselMmsiRef.current)) {
            const activeVessel = vesselsRef.current.get(activeVesselMmsiRef.current);
            if (activeVessel && activeVessel.track && activeVessel.track.length > 1) {
              trackSource.setData({
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: activeVessel.track },
                  properties: {}
                }]
              });
            } else {
              trackSource.setData({ type: 'FeatureCollection', features: [] });
            }
          } else {
            trackSource.setData({ type: 'FeatureCollection', features: [] });
          }
        }
      }, 1000);
    };

    const handleMsg = (msg: any) => {
      const meta = msg.MetaData;
      if (!meta) return;
      const mmsi = String(meta.MMSI ?? meta.mmsi ?? '');
      if (!mmsi) return;

      if (msg.MessageType === 'PositionReport') {
        const pr = msg.Message?.PositionReport ?? {};
        const lat = meta.latitude ?? pr.Latitude;
        const lon = meta.longitude ?? pr.Longitude;
        if (lat == null || lon == null) return;
        const sog = pr.Sog ?? 0;
        const cog = pr.Cog ?? 0;
        const hdg = (pr.TrueHeading != null && pr.TrueHeading !== 511) ? pr.TrueHeading : cog;
        const prev = vesselsRef.current.get(mmsi) ?? {};
        const track = prev.track || [];
        if (track.length === 0 || track[track.length - 1][0] !== lon || track[track.length - 1][1] !== lat) {
          track.push([lon, lat]);
          if (track.length > 500) track.shift(); // Keep max 500 points
        }
        vesselsRef.current.set(mmsi, {
          ...prev, mmsi, lat, lon, sog, cog, heading: hdg, track,
          navStatus: pr.NavigationalStatus ?? prev.navStatus,
          name: (meta.ShipName?.trim() || prev.name || mmsi),
          lastUpdate: Date.now(),
          icon: sog > 3 ? 'ship-fast' : sog > 0.5 ? 'ship-slow' : 'ship-still'
        });
        isDirty = true;
      } else if (msg.MessageType === 'ShipStaticData') {
        const sd = msg.Message?.ShipStaticData ?? {};
        const prev = vesselsRef.current.get(mmsi) ?? { mmsi, lastUpdate: Date.now(), icon: 'ship-still' };
        vesselsRef.current.set(mmsi, {
          ...prev,
          name: ((sd.Name || meta.ShipName || prev.name || mmsi).trim()),
          callSign: sd.CallSign?.trim() || prev.callSign,
          imo: sd.ImoNumber ?? prev.imo,
          shipType: sd.Type ?? prev.shipType,
          destination: sd.Destination?.trim() || prev.destination,
          draught: sd.MaximumStaticDraught ?? prev.draught,
        });
        isDirty = true;
      }
    };

    const connect = () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      try { wsRef.current = new WebSocket('wss://stream.aisstream.io/v0/stream'); }
      catch { return; }

      wsRef.current.onopen = () => {
        reconnectDelay = 3000;
        subscribe();
        startFlush();
      };

      wsRef.current.onmessage = async ({ data }) => {
        try {
          const text = data instanceof Blob ? await data.text() : data;
          const msg = JSON.parse(text);
          handleMsg(msg);
        } catch (e) {}
      };

      wsRef.current.onclose = () => {
        if (flushTimer) clearInterval(flushTimer);
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
      };
    };

    connect();
    map.on('moveend', scheduleResub);

    return () => {
      map.off('moveend', scheduleResub);
      if (resubTimer) clearTimeout(resubTimer);
      if (flushTimer) clearInterval(flushTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [settings.layers, mapLoaded, settings.aisstreamCredentials]);

};
