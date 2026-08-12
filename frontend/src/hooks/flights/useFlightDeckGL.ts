import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { PathLayer, TextLayer } from '@deck.gl/layers';
import { GLTFLoader } from '@loaders.gl/gltf';
import type maplibregl from 'maplibre-gl';
import React from 'react';

interface FlightDeckGLProps {
  map: maplibregl.Map | null;
  flightsLayer: any;
  selectedAircraftIdRef: React.MutableRefObject<string | null>;
  selectedFlightTrackRef: React.MutableRefObject<number[][]>;
  flightHistoryRef: React.MutableRefObject<Record<string, { lastFetched: number; track: [number, number, number, number][] }>>;
  setSelectedAircraftId: (id: string | null) => void;
  deckOverlayRef: React.MutableRefObject<MapboxOverlay | null>;
}

export const useFlightDeckGL = ({
  map,
  flightsLayer,
  selectedAircraftIdRef,
  selectedFlightTrackRef,
  flightHistoryRef,
  setSelectedAircraftId,
  deckOverlayRef
}: FlightDeckGLProps) => {

  const updateDeckGL = (dataStates: any[]) => {
    if (!map || !flightsLayer) return;

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

      const iconData = dataStates.map((state: any) => {
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
              const liveState = dataStates.find((s: any) => s[0] === selectedAircraftIdRef.current);
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

  return { updateDeckGL };
};
