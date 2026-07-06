import re

with open('flights_logic.txt', 'r') as f:
    flights_logic = f.read()

# Replace MapboxMap.tsx specific refs
flights_logic = flights_logic.replace("const map = mapRef.current;", "")
flights_logic = flights_logic.replace("mapRef.current", "map")
flights_logic = flights_logic.replace("setSettings(prev =>", "setSettings?.(prev =>")

hook_template = """import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { PathLayer, IconLayer, TextLayer } from '@deck.gl/layers';
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

__FLIGHTS_LOGIC__

  return { deckOverlayRef };
};
"""

hook_content = hook_template.replace("__FLIGHTS_LOGIC__", flights_logic)

with open('frontend/src/hooks/useFlightStream.ts', 'w') as f:
    f.write(hook_content)

