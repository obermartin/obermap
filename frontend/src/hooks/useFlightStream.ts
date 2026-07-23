import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { PathLayer, TextLayer } from '@deck.gl/layers';
import { GLTFLoader } from '@loaders.gl/gltf';
import { getFlagHtml } from '../utils/mapUtils';
import type { AppSettings } from '../types';
import { haversineDistance } from '../utils/mapUtils';

export interface FlightStreamProps {
  map: maplibregl.Map | null;
  mapLoaded: boolean;
  settings: AppSettings;
  activeTool: string | null;
  revealedTriggers: Set<string>;
  hiddenTriggers: Set<string>;
  annotations: any[];
  selectedAircraftId: string | null;
  setSelectedAircraftId: (id: string | null) => void;
  selectedAircraftMetaRef: React.MutableRefObject<any>;
  selectedFlightTrackRef: React.MutableRefObject<number[][]>;
  aircraftPopupRef: React.MutableRefObject<maplibregl.Popup | null>;
  t: (key: string) => string;
}

export const useFlightStream = ({
  map,
  mapLoaded,
  settings,
  activeTool,
  revealedTriggers,
  hiddenTriggers,
  annotations,
  selectedAircraftId,
  setSelectedAircraftId,
  selectedAircraftMetaRef,
  selectedFlightTrackRef,
  aircraftPopupRef,
  t
}: FlightStreamProps) => {
  const openSkyTokenRef = useRef<{ token: string, expires: number } | null>(null);
  const flightHistoryRef = useRef<Record<string, { lastFetched: number; track: [number, number, number, number][] }>>({});
  const updateDeckGLRef = useRef<(() => void) | null>(null);
  const deckOverlayRef = useRef<MapboxOverlay | null>(null);

  const selectedAircraftIdRef = useRef<string | null>(selectedAircraftId);
  useEffect(() => {
    selectedAircraftIdRef.current = selectedAircraftId;
  }, [selectedAircraftId]);

  const flightsLayer = settings.layers.find(l => l.type === 'flights');
  const triggerExistsForFlights = (id: string | undefined) => id ? annotations.some(a => a.id === id) : false;
  const hasRevealTriggerForFlights = flightsLayer ? !!flightsLayer.animationTriggerId && triggerExistsForFlights(flightsLayer.animationTriggerId) : false;
  const hasHideTriggerForFlights = flightsLayer ? !!flightsLayer.hideAnimationTriggerId && triggerExistsForFlights(flightsLayer.hideAnimationTriggerId) : false;
  const isRevealedForFlights = activeTool !== 'none' || (!hasRevealTriggerForFlights || (flightsLayer && revealedTriggers.has(flightsLayer.animationTriggerId!)));
  const isHiddenForFlights = activeTool === 'none' && flightsLayer && ((hasHideTriggerForFlights && hiddenTriggers.has(flightsLayer.hideAnimationTriggerId!)) || hiddenTriggers.has(flightsLayer.id));
  const isFlightsVisible = flightsLayer?.visible && isRevealedForFlights && !isHiddenForFlights;

  // Polling for flights

  useEffect(() => {
    
    if (!map || !mapLoaded || !map.isStyleLoaded() || !flightsLayer || !isFlightsVisible) {
      if (map && deckOverlayRef.current) {
        map.removeControl(deckOverlayRef.current);
        deckOverlayRef.current.finalize();
        deckOverlayRef.current = null;
      }
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    let isActive = true;
    let currentInterval = 10000;

    const fetchFlights = async () => {
      if (!isActive) return;
      try {
        const bounds = map.getBounds();
        if (!bounds) return;
        const lamin = bounds.getSouth();
        const lamax = bounds.getNorth();
        const lomin = bounds.getWest();
        const lomax = bounds.getEast();
        
        let token = '';
        if (settings.openSkyCredentials?.clientId && settings.openSkyCredentials?.clientSecret) {
          if (!openSkyTokenRef.current || Date.now() > openSkyTokenRef.current.expires) {
            const tokenRes = await fetch('./api.php?action=opensky_token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `grant_type=client_credentials&client_id=${encodeURIComponent(settings.openSkyCredentials.clientId)}&client_secret=${encodeURIComponent(settings.openSkyCredentials.clientSecret)}`
            });
            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              if (tokenData.access_token) {
                openSkyTokenRef.current = {
                  token: tokenData.access_token,
                  expires: Date.now() + (tokenData.expires_in - 30) * 1000
                };
              }
            }
          }
          if (openSkyTokenRef.current) {
            token = openSkyTokenRef.current.token;
          }
        }
        
        const url = `./api.php?action=opensky&lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}${token ? '&token=' + encodeURIComponent(token) : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`OpenSky API error: ${res.statusText}`);
        
        const data = await res.json();

        if (data.states && data.states.length > 0) {
            // Calculate eligible aircraft for paths
            const visibleStates = data.states.filter((s: any) => s[5] !== null && s[6] !== null && s[5] >= lomin && s[5] <= lomax && s[6] >= lamin && s[6] <= lamax);
            let eligiblePlanes: any[] = [];
            if (flightsLayer.is3DMode) {
                const center = map.getCenter();
                if (center) {
                    visibleStates.sort((a: any, b: any) => {
                        const distA = haversineDistance([center.lng, center.lat], [a[5], a[6]]);
                        const distB = haversineDistance([center.lng, center.lat], [b[5], b[6]]);
                        return distA - distB;
                    });
                }
                eligiblePlanes = visibleStates.slice(0, 20);
            } else {
                eligiblePlanes = visibleStates.slice(0, 20);
            }
            
            if (selectedAircraftIdRef.current) {
                const selectedState = visibleStates.find((s: any) => s[0] === selectedAircraftIdRef.current);
                if (selectedState && !eligiblePlanes.find(p => p[0] === selectedAircraftIdRef.current)) {
                    eligiblePlanes.push(selectedState);
                }
            }
            
            const now = Date.now() / 1000;
            
            // Fetch track for new eligible planes
            for (const p of eligiblePlanes) {
                const icao24 = p[0];
                const history = flightHistoryRef.current[icao24];
                if (!history || (now - history.lastFetched > 60)) { // fetch if no history or older than 60s
                    // Fetch from opensky_track
                    try {
                        const tRes = await fetch(`./api.php?action=opensky_track&icao24=${icao24}&time=0${token ? '&token=' + encodeURIComponent(token) : ''}`);
                        if (tRes.ok) {
                            const tData = await tRes.json();
                            if (tData.path) {
                                let lastValidAlt = 0;
                                // Pre-scanner for first valid altitude
                                for (let i = 0; i < tData.path.length; i++) {
                                    if (tData.path[i][3] !== null) {
                                        lastValidAlt = tData.path[i][3];
                                        break;
                                    }
                                }
                                
                                const validPath = tData.path.filter((pt: any) => pt[0] <= p[3]).map((pt: any) => {
                                    if (pt[3] !== null) lastValidAlt = pt[3];
                                    return [pt[2], pt[1], lastValidAlt, pt[0]]; // [lon, lat, alt, time]
                                });
                                
                                flightHistoryRef.current[icao24] = {
                                    lastFetched: now,
                                    track: validPath
                                };
                            }
                        } else {
                            // Cache empty track to avoid spamming 404 requests
                            flightHistoryRef.current[icao24] = {
                                lastFetched: now,
                                track: flightHistoryRef.current[icao24]?.track || []
                            };
                        }
                    } catch(e) {}
                }
            }
            
            // Append live state to all tracks (both eligible and not, we prune later)
            for (const s of data.states) {
                const icao24 = s[0];
                if (flightHistoryRef.current[icao24]) {
                    const hist = flightHistoryRef.current[icao24];
                    let lastValidAlt = hist.track.length > 0 ? hist.track[hist.track.length - 1][2] : 0;
                    let currentAlt = s[7] !== null ? s[7] : lastValidAlt;
                    
                    // Only append if it's newer than the last point
                    if (hist.track.length === 0 || s[3] > hist.track[hist.track.length - 1][3]) {
                        hist.track.push([s[5], s[6], currentAlt, s[3]]);
                    }
                    
                    // Prune older than 5 minutes (300 seconds)
                    const cutoff = s[3] - 300;
                    hist.track = hist.track.filter((pt: any) => pt[3] >= cutoff);
                }
            }

            for (const s of data.states) {
                if (s[0] === selectedAircraftIdRef.current) {
                    const lastPt = selectedFlightTrackRef.current[selectedFlightTrackRef.current.length - 1];
                    if (!lastPt || lastPt[0] !== s[5] || lastPt[1] !== s[6]) {
                        selectedFlightTrackRef.current = [...selectedFlightTrackRef.current, [s[5], s[6], s[7] !== null ? s[7] : 0, s[3]]];
                        if (selectedFlightTrackRef.current.length === 1) {
                            window.dispatchEvent(new CustomEvent('exportDataReady', {
                                detail: { type: 'flights', id: selectedAircraftIdRef.current, ready: true }
                            }));
                        }
                        const trackSource = map.getSource('selected-flight-track') as maplibregl.GeoJSONSource;
                        if (trackSource) {
                            trackSource.setData({
                                type: 'FeatureCollection',
                                features: [{
                                    type: 'Feature',
                                    geometry: { type: 'LineString', coordinates: selectedFlightTrackRef.current },
                                    properties: {}
                                }]
                            });
                        }
                    }
                }
            }
            
            // Clean up history for planes no longer eligible
            const eligibleIds = new Set(eligiblePlanes.map(p => p[0]));
            for (const id of Object.keys(flightHistoryRef.current)) {
                if (!eligibleIds.has(id)) {
                    delete flightHistoryRef.current[id];
                }
            }

            updateDeckGLRef.current = () => {
                const pathData = Object.entries(flightHistoryRef.current)
                  .filter(([icao24]) => icao24 !== selectedAircraftIdRef.current)
                  .map(([icao24, h]: [string, any]) => {
                    const aircraftColor = flightsLayer.aircraftColors && Object.keys(flightsLayer.aircraftColors).length > 0 
                      ? (flightsLayer.aircraftColors[icao24] || flightsLayer.globalAircraftColor || '#ffffff') 
                      : (flightsLayer.globalAircraftColor || '#ffffff');
                    
                    let r = 255, g = 255, b = 255;
                    if (aircraftColor.startsWith('#') && aircraftColor.length === 7) {
                        r = parseInt(aircraftColor.slice(1, 3), 16);
                        g = parseInt(aircraftColor.slice(3, 5), 16);
                        b = parseInt(aircraftColor.slice(5, 7), 16);
                    }
                    
                    return {
                        path: h.track.map((pt: any) => [pt[0], pt[1], pt[2]]),
                        color: [r, g, b, 128],
                        hexColor: aircraftColor
                    };
                });

                const shadowSource = map.getSource('automated-flight-tracks-shadow') as maplibregl.GeoJSONSource;
                if (shadowSource) {
                    shadowSource.setData({
                        type: 'FeatureCollection',
                        features: pathData.map((d: any) => ({
                            type: 'Feature',
                            geometry: { type: 'LineString', coordinates: d.path.map((pt: any) => [pt[0], pt[1]]) },
                            properties: { color: d.hexColor }
                        }))
                    });
                }

                if (flightsLayer.is3DMode) {

                const pathLayer = new PathLayer({
                    id: 'flight-paths-3d',
                    data: pathData,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => d.color,
                    getWidth: 3,
                    widthUnits: 'pixels',
                    jointRounded: true,
                    capRounded: true,
                    billboard: true
                });

                const iconData = data.states.map((state: any) => {
                    const icao24 = state[0];
                    const callsign = state[1] ? state[1].trim() : '';
                    const lon = state[5];
                    const lat = state[6];
                    const alt = state[7] !== null ? state[7] : 0;
                    const trueTrack = state[10] !== null ? state[10] : 0;
                    const velocity = state[9] !== null ? Math.round(state[9] * 3.6) : 0;

                    const aircraftColor = flightsLayer.aircraftColors && Object.keys(flightsLayer.aircraftColors).length > 0 
                      ? (flightsLayer.aircraftColors[icao24] || flightsLayer.globalAircraftColor || '#ffffff') 
                      : (flightsLayer.globalAircraftColor || '#ffffff');
                    
                    let r = 255, g = 255, b = 255;
                    if (aircraftColor.startsWith('#') && aircraftColor.length === 7) {
                        r = parseInt(aircraftColor.slice(1, 3), 16);
                        g = parseInt(aircraftColor.slice(3, 5), 16);
                        b = parseInt(aircraftColor.slice(5, 7), 16);
                    }
                    
                    const isSelected = icao24 === selectedAircraftIdRef.current;
                    const opacity = 255;

                    return {
                        position: [lon, lat, alt],
                        angle: -trueTrack,
                        color: [r, g, b, opacity],
                        callsign: callsign || icao24,
                        icao24: icao24,
                        altitude: alt,
                        velocity: velocity,
                        isSelected: isSelected
                    };
                });



                const currentZoom = map.getZoom();
                const dynamicScale = 250000 / Math.pow(2, currentZoom);

                const iconLayer = new ScenegraphLayer({
                    id: 'flight-icons-3d',
                    data: iconData,
                    scenegraph: './lowpolyjet_v4.glb',
                    loaders: [GLTFLoader],
                    getPosition: (d: any) => d.position,
                    getOrientation: (d: any) => [0, d.angle, 90],
                    sizeScale: dynamicScale,
                    getColor: (d: any) => d.color,
                    pickable: true,
                    onClick: (info) => {
                        if (info.object) {
                            setSelectedAircraftId(info.object.icao24);
                        }
                    },
                    parameters: { depthTest: true }
                });

                const textLayer = new TextLayer({
                    id: 'flight-labels-3d',
                    data: flightsLayer.showCallsigns ? iconData : [],
                    getPosition: (d: any) => d.position,
                    getText: (d: any) => `${d.callsign}\n${Math.round(d.altitude)}m | ${d.velocity}km/h`,
                    getSize: 12,
                    getColor: (d: any) => d.color,
                    getAlignmentBaseline: 'bottom',
                    getPixelOffset: [0, -15],
                    billboard: true,
                    background: false,
                    parameters: { depthTest: true }
                });
                
                const latestTime = flightHistoryRef.current[selectedAircraftIdRef.current || '']?.track.slice(-1)[0]?.[3] || Infinity;
                const selectedPathData = (selectedAircraftIdRef.current && selectedFlightTrackRef.current.length > 0) ? [{
                    path: (() => {
                        let finalPath = selectedFlightTrackRef.current
                            .filter((pt: any) => !pt[3] || pt[3] <= latestTime)
                            .map((pt: any) => [pt[0], pt[1], pt[2] || 0]);
                        
                        // Guarantee the path physically touches the current live icon
                        const liveState = data.states.find((s: any) => s[0] === selectedAircraftIdRef.current);
                        if (liveState && liveState[5] !== null && liveState[6] !== null) {
                            const livePt = [liveState[5], liveState[6], liveState[7] || 0];
                            const lastPathPt = finalPath[finalPath.length - 1];
                            if (!lastPathPt || lastPathPt[0] !== livePt[0] || lastPathPt[1] !== livePt[1]) {
                                finalPath.push(livePt);
                            }
                        }
                        return finalPath;
                    })(),
                    color: (() => {
                        const aircraftColor = flightsLayer.aircraftColors && Object.keys(flightsLayer.aircraftColors).length > 0 
                          ? (flightsLayer.aircraftColors[selectedAircraftIdRef.current || ''] || flightsLayer.globalAircraftColor || '#ffffff') 
                          : (flightsLayer.globalAircraftColor || '#ffffff');
                        let r = 255, g = 255, b = 255;
                        if (aircraftColor.startsWith('#') && aircraftColor.length === 7) {
                            r = parseInt(aircraftColor.slice(1, 3), 16);
                            g = parseInt(aircraftColor.slice(3, 5), 16);
                            b = parseInt(aircraftColor.slice(5, 7), 16);
                        }
                        return [r, g, b, 255];
                    })()
                }] : [];

                const selectedPathLayer = new PathLayer({
                    id: 'selected-flight-path-3d',
                    data: selectedPathData,
                    getPath: (d: any) => d.path,
                    getColor: (d: any) => d.color,
                    getWidth: 5,
                    widthUnits: 'pixels',
                    jointRounded: true,
                    capRounded: true,
                    billboard: true
                });

                if (!deckOverlayRef.current) {
                    deckOverlayRef.current = new MapboxOverlay({
                        interleaved: true,
                        layers: [pathLayer, selectedPathLayer, iconLayer, textLayer]
                    });
                    map.addControl(deckOverlayRef.current);
                } else {
                    deckOverlayRef.current.setProps({
                        layers: [pathLayer, selectedPathLayer, iconLayer, textLayer]
                    });
                }
            } else {
                if (deckOverlayRef.current) {
                    map.removeControl(deckOverlayRef.current);
                    deckOverlayRef.current.finalize();
                    deckOverlayRef.current = null;
                }
            }
          };
          updateDeckGLRef.current();
        }

        const features = (data.states || []).map((state: any) => {
          const lon = state[5];
          const lat = state[6];
          const true_track = state[10];
          if (lon === null || lat === null) return null;
          
          let category = Number(state[17]) || 0;

          if (state[0] === selectedAircraftIdRef.current) {
            // Update Popup and Route
            const callsign = state[1] ? state[1].trim() : '';
            if (callsign && (!selectedAircraftMetaRef.current || selectedAircraftMetaRef.current.callsign !== callsign)) {
              selectedAircraftMetaRef.current = { ...selectedAircraftMetaRef.current, callsign, icao24: state[0] };
              // Fetch route now that we have callsign
              fetch(`./api.php?action=opensky_route&callsign=${callsign}${token ? '&token=' + encodeURIComponent(token) : ''}`)
                .then(res => res.ok ? res.json() : null)
                .then(routeData => {
                  if (routeData && routeData.route) {
                    selectedAircraftMetaRef.current.route = routeData.route.join(' → ');
                  } else {
                    selectedAircraftMetaRef.current.route = t('Unknown Route');
                  }
                })
                .catch(() => {});
            }

            if (flightsLayer.is3DMode) {
              if (aircraftPopupRef.current) {
                aircraftPopupRef.current.remove();
                aircraftPopupRef.current = null;
              }
            } else {
              if (!aircraftPopupRef.current) {
                aircraftPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'flight-popup' })
                  .setLngLat([lon, lat])
                  .addTo(map);
              } else {
                aircraftPopupRef.current.setLngLat([lon, lat]);
              }
              
              const meta = selectedAircraftMetaRef.current?.icao24 === state[0] ? selectedAircraftMetaRef.current : {};
              const flag = getFlagHtml(state[2]);
              const alt = state[7] !== null ? Math.round(state[7]) + 'm' : 'N/A';
              const spd = state[9] !== null ? Math.round(state[9] * 3.6) + 'km/h' : 'N/A';
              
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
              // Add custom style block to override Mapbox default popup padding and background
              const style = document.createElement('style');
              style.innerHTML = '.flight-popup .maplibregl-popup-content { padding: 0; background: transparent; box-shadow: none; } .flight-popup .maplibregl-popup-tip { border-top-color: #09090b; }';
              document.head.appendChild(style);
              
              aircraftPopupRef.current.setHTML(popupHtml);
            }
          }

          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: {
              icao24: state[0],
              callsign: state[1] ? state[1].trim() : '',
              country: state[2],
              altitude: state[7],
              velocity: state[9],
              true_track: true_track || 0,
              category: category
            }
          };
        }).filter(Boolean);

        const geojson = { type: 'FeatureCollection', features };
        const sourceId = `dynamic-source-${flightsLayer.id}`;
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
        if (source) source.setData(geojson as GeoJSON.FeatureCollection);
        
        currentInterval = 10000; // Reset backoff on success
      } catch(err) {
        console.error('Error fetching flights:', err);
        currentInterval = Math.min(currentInterval * 1.5, 300000); // Exponential backoff up to 5 min
      } finally {
        if (isActive) {
          timeoutId = setTimeout(fetchFlights, currentInterval);
        }
      }
    };

    const onZoom = () => {
      if (updateDeckGLRef.current) updateDeckGLRef.current();
    };
    map.on('zoom', onZoom);

    fetchFlights();
    return () => {
      isActive = false;
      clearTimeout(timeoutId);
      map.off('zoom', onZoom);
    };
  }, [settings.layers, mapLoaded, isFlightsVisible]);


  // Fetch track when selectedAircraftId changes
  useEffect(() => {
    
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;
    
    const source = map.getSource('selected-flight-track') as maplibregl.GeoJSONSource;
    if (!source) return;

    selectedFlightTrackRef.current = [];
    source.setData({ type: 'FeatureCollection', features: [] });
    if (updateDeckGLRef.current) updateDeckGLRef.current();

    if (!selectedAircraftId) {
      if (aircraftPopupRef.current) {
        aircraftPopupRef.current.remove();
        aircraftPopupRef.current = null;
      }
      return;
    }

    const flightsLayer = settings.layers.find(l => l.type === 'flights');
    if (!flightsLayer || !flightsLayer.visible) return;
    
    window.dispatchEvent(new CustomEvent('exportDataReady', {
      detail: { type: 'flights', id: selectedAircraftId, ready: false }
    }));

    const fetchTrack = async () => {
      try {
        let token = '';
        if (settings.openSkyCredentials?.clientId && settings.openSkyCredentials?.clientSecret) {
          if (!openSkyTokenRef.current || Date.now() > openSkyTokenRef.current.expires) {
            const tokenRes = await fetch('./api.php?action=opensky_token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `grant_type=client_credentials&client_id=${encodeURIComponent(settings.openSkyCredentials.clientId)}&client_secret=${encodeURIComponent(settings.openSkyCredentials.clientSecret)}`
            });
            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              if (tokenData.access_token) {
                openSkyTokenRef.current = {
                  token: tokenData.access_token,
                  expires: Date.now() + (tokenData.expires_in - 30) * 1000
                };
              }
            }
          }
          if (openSkyTokenRef.current) token = openSkyTokenRef.current.token;
        }

        const url = `./api.php?action=opensky_track&icao24=${selectedAircraftId}&time=0${token ? '&token=' + encodeURIComponent(token) : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch track');
        
        const data = await res.json();
        if (data && data.path && data.path.length > 0) {
          let coordinates = data.path.map((pt: any) => [pt[2], pt[1], pt[3] || 0, pt[0]]); // lon, lat, alt, time
          
          const hist = flightHistoryRef.current[selectedAircraftId];
          if (hist && hist.track.length > 0) {
              const oldestHistTime = hist.track[0][3];
              const validApiCoords = coordinates.filter((pt: any) => pt[3] < oldestHistTime);
              validApiCoords.push(...hist.track);
              coordinates = validApiCoords;
          }
          
          selectedFlightTrackRef.current = coordinates;
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'flights', id: selectedAircraftId, ready: coordinates.length > 0 }
          }));
          source.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'LineString', coordinates },
              properties: {}
            }]
          });
          if (updateDeckGLRef.current) updateDeckGLRef.current();
        } else {
          selectedFlightTrackRef.current = [];
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'flights', id: selectedAircraftId, ready: 'empty' }
          }));
          source.setData({ type: 'FeatureCollection', features: [] });
        }
      } catch (err) {
        console.error('Error fetching track:', err);
        selectedFlightTrackRef.current = [];
        window.dispatchEvent(new CustomEvent('exportDataReady', {
          detail: { type: 'flights', id: selectedAircraftId, ready: 'empty' }
        }));
        source.setData({ type: 'FeatureCollection', features: [] });
      }

      // Fetch Metadata
      try {
        let token = '';
        if (openSkyTokenRef.current) token = openSkyTokenRef.current.token;

        const metaRes = await fetch(`./api.php?action=opensky_metadata&icao24=${selectedAircraftId}${token ? '&token=' + encodeURIComponent(token) : ''}`);
        let metaData: any = null;
        if (metaRes.ok) metaData = await metaRes.json();
        
        selectedAircraftMetaRef.current = {
          ...selectedAircraftMetaRef.current,
          icao24: selectedAircraftId,
          registration: metaData?.registration || 'Unknown',
          type: metaData?.model || metaData?.manufacturerName || 'Unknown Type'
        };
      } catch (e) {
        console.error('Error fetching metadata:', e);
      }
    };

    fetchTrack();
  }, [selectedAircraftId, mapLoaded, settings.openSkyCredentials]);

  // Export GeoJSON Listener
  useEffect(() => {
    const handleExport = (e: CustomEvent) => {
      if (e.detail?.type === 'flights' && e.detail?.id) {
        if (selectedAircraftIdRef.current === e.detail.id && selectedFlightTrackRef.current.length > 0) {
          import('../utils/exportUtils').then(({ downloadGeoJSON }) => {
            const geojson = {
              type: 'FeatureCollection',
              features: [{
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: selectedFlightTrackRef.current },
                properties: { icao24: selectedAircraftIdRef.current, ...selectedAircraftMetaRef.current }
              }]
            };
            downloadGeoJSON(geojson, `flight_path_${e.detail.id}.geojson`);
          });
        }
      }
    };
    window.addEventListener('requestGeoJsonExport', handleExport as EventListener);
    return () => window.removeEventListener('requestGeoJsonExport', handleExport as EventListener);
  }, []);





  return { deckOverlayRef };
};
