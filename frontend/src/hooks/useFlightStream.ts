import { useEffect, useRef } from 'react';
import type maplibregl from 'maplibre-gl';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { AppSettings } from '../types';
import { useFlightData } from './flights/useFlightData';
import { useFlightDeckGL } from './flights/useFlightDeckGL';

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
  const flightHistoryRef = useRef<Record<string, { lastFetched: number; track: [number, number, number, number][] }>>({});
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
  const isFlightsVisible: boolean = !!(flightsLayer?.visible && isRevealedForFlights && !isHiddenForFlights);

  const { updateDeckGL } = useFlightDeckGL({
    map,
    flightsLayer,
    selectedAircraftIdRef,
    selectedFlightTrackRef,
    flightHistoryRef,
    setSelectedAircraftId,
    deckOverlayRef
  });

  useEffect(() => {
    if (!map || !isFlightsVisible) {
      if (map && deckOverlayRef.current) {
        map.removeControl(deckOverlayRef.current);
        deckOverlayRef.current.finalize();
        deckOverlayRef.current = null;
      }
    }
  }, [map, isFlightsVisible]);

  useFlightData({
    map,
    mapLoaded,
    settings,
    flightsLayer,
    isFlightsVisible,
    selectedAircraftIdRef,
    selectedFlightTrackRef,
    flightHistoryRef,
    selectedAircraftMetaRef,
    aircraftPopupRef,
    updateDeckGL,
    t
  });

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
