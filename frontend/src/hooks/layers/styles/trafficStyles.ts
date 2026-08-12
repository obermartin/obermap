import maplibregl from 'maplibre-gl';
import { setLayerFade } from '../layerVisibilityUtils';

export const addTrafficLayers = (
  map: maplibregl.Map,
  layer: any,
  sourceId: string,
  layerId: string,
  firstSymbolId: string | undefined,
  fallbackFont: string[],
  selectedAircraftId: string | null,
  selectedVesselMmsi: string | null
) => {
  if (layer.type === 'flights') {
    map.addLayer({
      id: layerId,
      type: 'symbol',
      source: sourceId,
      layout: { 
        visibility: layer.visible ? 'visible' : 'none',
        'icon-image': [
          'match',
          ['get', 'category'],
          8, 'helicopter',
          7, 'military',
          2, 'small_aircraft',
          3, 'small_aircraft',
          9, 'small_aircraft',
          12, 'small_aircraft',
          'airplane' // default
        ],
        'icon-size': layer.is3DMode ? 0.8 : 0.4,
        'icon-anchor': layer.is3DMode ? 'center' : 'bottom',
        'icon-rotate': ['get', 'true_track'],
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': layer.is3DMode ? 'map' : 'auto',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      },
      paint: {
        'icon-opacity': layer.is3DMode ? 0.4 : (selectedAircraftId 
          ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
          : 1.0),
        'icon-color': layer.is3DMode ? '#000000' : (layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
          ? ['match', ['to-string', ['get', 'icao24']], ...Object.entries(layer.aircraftColors).flat(), layer.globalAircraftColor || '#ffffff'] as any
          : (layer.globalAircraftColor || '#ffffff'))
      }
    }, firstSymbolId);
    
    map.addLayer({
      id: `${layerId}-labels`,
      type: 'symbol',
      source: sourceId,
      layout: {
        visibility: (layer.visible && !layer.is3DMode && layer.showCallsigns) ? 'visible' : 'none',
        'text-field': layer.is3DMode 
          ? ['concat', ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']], '\n', ['to-string', ['get', 'altitude']], 'm | ', ['to-string', ['get', 'velocity']], 'km/h']
          : ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']],
        'text-font': fallbackFont,
        'text-size': 10,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-ignore-placement': true,
        'text-allow-overlap': true
      },
      paint: {
        'text-color': layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
          ? ['match', ['to-string', ['get', 'icao24']], ...Object.entries(layer.aircraftColors).flat(), layer.globalAircraftColor || '#ffffff'] as any
          : (layer.globalAircraftColor || '#ffffff'),
        'text-opacity': selectedAircraftId 
          ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
          : 1.0
      }
    });
  } else if (layer.type === 'vessels') {
    map.addLayer({
      id: layerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        visibility: layer.visible ? 'visible' : 'none',
        'icon-image': ['coalesce', ['get', 'icon'], 'ship-still'],
        'icon-size': [
          'interpolate', ['linear'], ['zoom'],
          3, 0.1375,
          8, 0.2125,
          13, 0.3
        ],
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'text-field': ['step', ['zoom'], '', 9, ['get', 'name']],
        'text-size': 9,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-allow-overlap': false,
        'text-ignore-placement': false
      },
      paint: {
        'icon-opacity': selectedVesselMmsi 
          ? ['case', ['==', ['to-string', ['get', 'mmsi']], selectedVesselMmsi], 1.0, 0.5]
          : 1.0,
        'icon-color': layer.vesselColors && Object.keys(layer.vesselColors).length > 0 
          ? [
              'match', 
              ['to-string', ['get', 'mmsi']], 
              ...Object.entries(layer.vesselColors).flat(),
              layer.globalVesselColor || '#ffffff'
            ] 
          : (layer.globalVesselColor || '#ffffff') as any,
        'text-color': '#ffffff',
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 1]
      }
    }, firstSymbolId);
  }
};

export const updateTrafficLayerStyles = (
  map: maplibregl.Map,
  layer: any,
  layerId: string,
  fallbackFont: string[],
  selectedAircraftId: string | null,
  selectedVesselMmsi: string | null,
  layerFadeTimeoutsRef: React.MutableRefObject<Record<string, any>>,
  fadeDuration: number
) => {
  if (layer.type === 'flights') {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
      const colorExp = layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
        ? [
            'match', 
            ['to-string', ['get', 'icao24']], 
            ...Object.entries(layer.aircraftColors).flat(),
            layer.globalAircraftColor || '#ffffff'
          ] 
        : (layer.globalAircraftColor || '#ffffff');
        
      const iconOpacityBase = layer.is3DMode ? 0.4 : (selectedAircraftId 
        ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
        : 1.0);
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, layerId, 'icon', layer._effectiveOpacityVisible ?? true, iconOpacityBase, layer.visible);
      map.setPaintProperty(layerId, 'icon-color', layer.is3DMode ? '#000000' : colorExp as any);
      map.setLayoutProperty(layerId, 'icon-size', layer.is3DMode ? 0.8 : 0.4);
      map.setLayoutProperty(layerId, 'icon-anchor', layer.is3DMode ? 'center' : 'bottom');
      map.setLayoutProperty(layerId, 'icon-pitch-alignment', layer.is3DMode ? 'map' : 'auto');
      
      if (map.getLayer(`${layerId}-labels`)) {
        map.setLayoutProperty(`${layerId}-labels`, 'visibility', (layer.visible && !layer.is3DMode && layer.showCallsigns) ? 'visible' : 'none');
        map.setLayoutProperty(`${layerId}-labels`, 'text-field', layer.is3DMode 
            ? ['concat', ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']], '\n', ['to-string', ['get', 'altitude']], 'm | ', ['to-string', ['get', 'velocity']], 'km/h']
            : ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']]);
        const labelOpacityBase = selectedAircraftId 
          ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
          : 1.0;
        const isLabelVisible = (layer._effectiveOpacityVisible ?? true) && !layer.is3DMode;
        setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, `${layerId}-labels`, 'text', isLabelVisible, labelOpacityBase, layer.visible);
        map.setPaintProperty(`${layerId}-labels`, 'text-color', colorExp as any);
      } else if (layer.showCallsigns && !layer.is3DMode) {
        const firstSymbolId = map.getStyle().layers?.find(l => l.type === 'symbol')?.id;
        map.addLayer({
          id: `${layerId}-labels`,
          type: 'symbol',
          source: `dynamic-source-${layer.id}`,
          layout: {
            visibility: (layer.visible && !layer.is3DMode) ? 'visible' : 'none',
            'text-field': layer.is3DMode 
            ? ['concat', ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']], '\n', ['to-string', ['get', 'altitude']], 'm | ', ['to-string', ['get', 'velocity']], 'km/h']
            : ['case', ['==', ['get', 'callsign'], ''], ['get', 'icao24'], ['get', 'callsign']],
            'text-font': fallbackFont,
            'text-size': 10,
            'text-offset': [0, 1.5],
            'text-anchor': 'top',
            'text-ignore-placement': true,
            'text-allow-overlap': true
          },
          paint: {
            'text-color': colorExp as any,
            'text-opacity': selectedAircraftId 
              ? ['case', ['==', ['to-string', ['get', 'icao24']], selectedAircraftId], 1.0, 0.5]
              : 1.0
          }
        }, firstSymbolId);
      }
      
      if (map.getLayer('selected-flight-track-layer')) {
        const opacity = layer.flightpathOpacity ?? 0.8;
        const trackColorExp = layer.aircraftColors && Object.keys(layer.aircraftColors).length > 0 
          ? [
              'match', 
              selectedAircraftId || '', 
              ...Object.entries(layer.aircraftColors).flat(),
              layer.globalAircraftColor || '#ffffff'
            ] 
          : (layer.globalAircraftColor || '#ffffff');
          
        map.setPaintProperty('selected-flight-track-layer', 'line-opacity', layer.is3DMode ? 0.3 : opacity);
        map.setPaintProperty('selected-flight-track-layer', 'line-color', layer.is3DMode ? '#000000' : trackColorExp as any);
      }
      if (map.getLayer('automated-flight-tracks-shadow-layer')) {
        const opacity = layer.flightpathOpacity ?? 0.5;
        map.setPaintProperty('automated-flight-tracks-shadow-layer', 'line-opacity', layer.is3DMode ? 0.4 : opacity);
        map.setPaintProperty('automated-flight-tracks-shadow-layer', 'line-color', layer.is3DMode ? '#000000' : ['coalesce', ['get', 'color'], '#000000']);
        map.setLayoutProperty('automated-flight-tracks-shadow-layer', 'visibility', layer.visible ? 'visible' : 'none');
      }
    }
  } else if (layer.type === 'vessels') {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', layer.visible ? 'visible' : 'none');
      const colorExp = layer.vesselColors && Object.keys(layer.vesselColors).length > 0 
        ? [
            'match', 
            ['to-string', ['get', 'mmsi']], 
            ...Object.entries(layer.vesselColors).flat(),
            layer.globalVesselColor || '#ffffff'
          ] 
        : (layer.globalVesselColor || '#ffffff');
        
      const iconOpacityBase = selectedVesselMmsi 
        ? ['case', ['==', ['to-string', ['get', 'mmsi']], selectedVesselMmsi], 1.0, 0.5]
        : 1.0;
      setLayerFade(map, layerFadeTimeoutsRef, fadeDuration, layerId, 'icon', layer._effectiveOpacityVisible ?? true, iconOpacityBase, layer.visible);
      map.setPaintProperty(layerId, 'icon-color', colorExp as any);
      
      if (map.getLayer('selected-vessel-track-layer')) {
        const trackColorExp = layer.vesselColors && Object.keys(layer.vesselColors).length > 0 
          ? [
              'match', 
              selectedVesselMmsi || '', 
              ...Object.entries(layer.vesselColors).flat(),
              layer.globalVesselColor || '#ffffff'
            ] 
          : (layer.globalVesselColor || '#ffffff');
          
        map.setPaintProperty('selected-vessel-track-layer', 'line-color', trackColorExp as any);
      }
    }
  }
};
