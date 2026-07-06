import re

with open('src/components/MapContainer.tsx', 'r') as f:
    content = f.read()

# 1. Add visibility calculation before useEffect for flights
vis_logic = """
  // Flights Layer Visibility
  const flightsLayer = settings.layers.find(l => l.type === 'flights');
  const triggerExistsForFlights = (id: string | undefined) => id ? annotations.some(a => a.id === id) : false;
  const hasRevealTriggerForFlights = flightsLayer ? !!flightsLayer.animationTriggerId && triggerExistsForFlights(flightsLayer.animationTriggerId) : false;
  const hasHideTriggerForFlights = flightsLayer ? !!flightsLayer.hideAnimationTriggerId && triggerExistsForFlights(flightsLayer.hideAnimationTriggerId) : false;
  const isRevealedForFlights = activeTool !== 'none' || (!hasRevealTriggerForFlights || (flightsLayer && revealedTriggers.has(flightsLayer.animationTriggerId!)));
  const isHiddenForFlights = activeTool === 'none' && flightsLayer && ((hasHideTriggerForFlights && hiddenTriggers.has(flightsLayer.hideAnimationTriggerId!)) || hiddenTriggers.has(flightsLayer.id));
  const isFlightsVisible = flightsLayer?.visible && isRevealedForFlights && !isHiddenForFlights;

  // Polling for flights
"""
content = content.replace("  // Polling for flights", vis_logic)

# 2. Update useEffect dependencies and early return
old_use_effect_start = """  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const flightsLayer = settings.layers.find(l => l.type === 'flights');
    if (!flightsLayer || !flightsLayer.visible) return;"""

new_use_effect_start = """  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !flightsLayer || !isFlightsVisible) {
      if (map && map.getLayer('flight-paths-3d')) {
        map.removeLayer('flight-paths-3d');
        delete deckLayersRef.current['flight-paths-3d'];
      }
      return;
    }"""
content = content.replace(old_use_effect_start, new_use_effect_start)

# 3. Update useEffect deps
content = content.replace("  }, [settings.layers, mapLoaded]);\n\n  // Polling for vessels", "  }, [settings.layers, mapLoaded, isFlightsVisible]);\n\n  // Polling for vessels")


with open('src/components/MapContainer.tsx', 'w') as f:
    f.write(content)

