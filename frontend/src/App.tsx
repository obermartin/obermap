import { useState, useEffect, useCallback } from 'react';
import { MapContainer } from './components/MapContainer';
import { Toolbar } from './components/Toolbar';
import { SavedViews } from './components/SavedViews';
import { OverviewScreen } from './components/OverviewScreen';
import { customAlert } from './utils/dialogService';
import type { Annotation, ToolType, StrokeType, AppSettings, MapLayer, RouteMode } from './types';
import { createArrowFeatures, calculateDistance } from './utils/mapUtils';

import { DEFAULT_ICON_CATEGORIES } from './defaultIcons';

const DEFAULT_SETTINGS: AppSettings = {
  mapToken: '',
  mapStyle: 'https://tiles.openfreemap.org/styles/liberty',
  defaultView: {
    center: [35.0, 48.5],
    zoom: 5,
    pitch: 45,
    bearing: 0
  },
  colorPalette: ['#DD0000', '#F15A38', '#F9A03F', '#F8DE22', '#8CC63F', '#009245', '#00A79D', '#27AAE1', '#2B3990', '#662D91', '#9E1F63'],
  icons: DEFAULT_ICON_CATEGORIES,
  labelDensity: 50,
  layers: [
    { id: 'split-container', name: 'Split View Container', type: 'split', visible: false, splitPosition: 0.5, splitDirection: 'vertical', splitLayers: [] },
    { id: 'deepstate', name: 'UKRAINE CURRENT', type: 'deepstate', visible: false, isLive: true },
    { id: 'copernicus', name: 'Wildfires (EFFIS)', type: 'raster', visible: false, url: 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}' },
    { id: 'satellite', name: 'Satellite Map Overlay (Mapbox)', type: 'satellite', visible: false },
    { id: 'flights', name: 'Air Traffic (OpenSky)', type: 'flights', visible: false },
    { id: 'wind', name: 'Wind (Open-Meteo)', type: 'wind', visible: true, windOpacity: 1, windParticleSize: 1.5, windParticleTrail: 94, showWindParticles: true, showWindArrows: false, showWindLegend: true, windParticleSizeBySpeed: true, windParticleSpeedBySpeed: true, windParticleTrailBySpeed: false, windParticleColorBySpeed: true },
    { id: 'weather_forecast', name: 'Weather Forecast (Open-Meteo)', type: 'weather_forecast', visible: false, showTemperature: true, showPrecipitation: false },
    { id: 'temperature', name: 'Live Temperature (OWM)', type: 'raster', visible: false, url: 'https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=d04bc4ae6960dc10d49057fc174ad2aa' },
    { id: 'precipitation', name: 'Live Rain (OWM)', type: 'raster', visible: false, url: 'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=d04bc4ae6960dc10d49057fc174ad2aa' },
    { id: 'google_satellite', name: 'Satellite View (Google)', type: 'raster', visible: false, url: 'https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' },
    { id: 'bing_satellite', name: 'Satellite View (Bing)', type: 'raster', visible: false, url: 'https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=685&mkt=en-us&n=z' },
    { id: 'population_density', name: 'Population Density', type: 'raster', visible: false, url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png' }
  ]
};

import { LayerSidebar } from './components/LayerSidebar';
import { Loader2, Menu } from 'lucide-react';
import { useTranslation } from './contexts/I18nContext';

export function App() {
  const { t } = useTranslation();
  const [activeTool, setActiveTool] = useState<ToolType>('none');
  const [currentColor, setCurrentColor] = useState(DEFAULT_SETTINGS.colorPalette[0]);
  const [currentStrokeType, setCurrentStrokeType] = useState<StrokeType>('solid');
  const [currentFillOpacity, setCurrentFillOpacity] = useState<number>(0.2);
  const [routeMode, setRouteMode] = useState<RouteMode>('driving');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [labelPrompt, setLabelPrompt] = useState<{ lngLat: [number, number], initialText?: string, initialSecondary?: string } | null>(null);
  const [headlinePrompt, setHeadlinePrompt] = useState<{ id?: string, initialPrimary?: string, initialSecondary?: string } | null>(null);
  useEffect(() => {
    if (headlinePrompt) {
      setHeadlineInput(headlinePrompt.initialPrimary || '');
      setHighlightedLineInput(headlinePrompt.initialSecondary || '');
    }
  }, [headlinePrompt]);
  const [activeDistance, setActiveDistance] = useState<number | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [secondaryLabelInput, setSecondaryLabelInput] = useState('');
  const [headlineInput, setHeadlineInput] = useState('');
  const [highlightedLineInput, setHighlightedLineInput] = useState('');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedIconId, setSelectedIconId] = useState<string | null>(null);
  const [isLayerSidebarOpen, setIsLayerSidebarOpen] = useState(false);
  const [activeGeojsonLayerId, setActiveGeojsonLayerId] = useState<string | null>(null);
  const [selectedGeojsonFeatureId, setSelectedGeojsonFeatureId] = useState<string | number | null>(null);
  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentView, setCurrentView] = useState<'overview' | 'map'>('overview');
  const [currentShow, setCurrentShow] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const showParam = params.get('show');
    if (showParam) {
      setCurrentShow(showParam);
      setCurrentView('map');
    } else {
      setCurrentView('overview');
    }
  }, []);

  useEffect(() => {
    if (currentView !== 'map' || !currentShow) return;
    
    setIsLoaded(false);
    
    // Load from backend
    fetch(`./api.php?show=${currentShow}&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        setIsLayerSidebarOpen(false);
        setIsToolbarOpen(false);
        if (data.annotations) {
          setAnnotations(data.annotations);
        } else {
          setAnnotations([]);
        }
        
        if (data.settings) {
          setSettings(() => {
            const savedLayers = data.settings.layers || [];
            
            const processSavedLayer = (savedLayer: MapLayer): MapLayer => {
              let merged = { ...savedLayer, _isDirty: false };
              
              // Backwards compatibility migration for deepstate
              if (merged.id === 'deepstate' && merged.type === 'geojson') {
                merged.type = 'deepstate';
              }
              if (merged.type === 'deepstate' && (merged.name === 'DeepStateMap Overlay' || merged.name === 'DeepStateMap')) {
                const dateStr = merged.startDate || new Date().toISOString().split('T')[0];
                merged.name = `UKRAINE ${dateStr.split('-').reverse().join('.')}`;
              }
              
              if (merged.id === 'copernicus' && merged.name !== 'Wildfires (EFFIS)') {
                merged.name = 'Wildfires (EFFIS)';
              }

              // Merge default properties if it's a default layer
              const defaultMatch = DEFAULT_SETTINGS.layers.find(l => l.id === merged.id);
              if (defaultMatch) {
                merged = { ...defaultMatch, ...merged, data: defaultMatch.data || merged.data };
              }

              if (merged.id === 'wind') {
                merged.showWindLegend = merged.showWindLegend !== false;
                merged.windParticleTrailBySpeed = merged.windParticleTrailBySpeed === true;
              }

              if (merged.type === 'split' && merged.splitLayers) {
                merged.splitLayers = merged.splitLayers.filter(Boolean).map(processSavedLayer);
              }

              // Ensure features have IDs
              if (merged.type === 'geojson' && merged.data && merged.data.features) {
                merged.data.features.forEach((f: any) => {
                  if (!f.properties) f.properties = {};
                  if (!f.properties.id) f.properties.id = `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                });
              }
              
              return merged;
            };

            const mergedLayers = savedLayers.map(processSavedLayer);
            // Note: The wind layer is no longer forcefully injected here.
            // It respects the user's saved 'settings.layers' state or the Default Map Layers toggles.

            let loadedIcons = data.settings.icons || DEFAULT_SETTINGS.icons;
            if (loadedIcons && loadedIcons.length > 0 && !('icons' in loadedIcons[0])) {
              loadedIcons = [
                ...DEFAULT_ICON_CATEGORIES,
                { id: 'generic', name: 'Generic', icons: loadedIcons }
              ];
            } else if (!loadedIcons || loadedIcons.length === 0) {
              loadedIcons = DEFAULT_ICON_CATEGORIES;
            }

            return { ...DEFAULT_SETTINGS, ...data.settings, layers: mergedLayers, icons: loadedIcons };
          });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      })
      .catch(err => console.error('Error loading data:', err))
      .finally(() => setIsLoaded(true));
  }, [currentView, currentShow]);

  const handleSave = useCallback(async (andExit = false) => {
    setIsSaving(true);

    const optimizeLayer = (layer: MapLayer): MapLayer => {
      if (!layer) return layer;
      let optimized = layer;
      if (!layer._isDirty && layer.data) {
        const { data, ...rest } = layer;
        optimized = { ...rest, _keepExistingData: true } as MapLayer;
      }
      if (optimized.type === 'split' && optimized.splitLayers) {
        optimized = {
          ...optimized,
          splitLayers: optimized.splitLayers.filter(Boolean).map(optimizeLayer)
        };
      }
      return optimized;
    };

    try {
      const optimizedSettings = {
        ...settings,
        layers: settings.layers.map(optimizeLayer)
      };

      fetch(`./api.php?show=${currentShow}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations, settings: optimizedSettings })
      })
      .then(res => res.json())
      .then(async () => {
        await customAlert(t('Annotations & Settings saved successfully!'));
        setSettings(prev => ({
          ...prev,
          layers: prev.layers.map(l => ({ ...l, _isDirty: false }))
        }));
        if (andExit) {
          const url = new URL(window.location.href);
          url.searchParams.delete('show');
          window.history.pushState({}, '', url);
          setCurrentShow(null);
          setCurrentView('overview');
        }
      })
      .catch(async err => {
        console.error('Error saving data:', err);
        await customAlert(t('Failed to save data.'));
      })
      .finally(() => setIsSaving(false));
    } catch (err) {
      console.error('Error during layer optimization:', err);
      await customAlert(t('Failed to save data due to an internal error.'));
      setIsSaving(false);
    }
  }, [annotations, settings, currentShow]);

  const handleExport = useCallback(() => {
    const features: GeoJSON.Feature[] = annotations.reduce((acc: GeoJSON.Feature[], ann) => {
      if (ann.type === 'paint') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid' }
        });
      } else if (ann.type === 'measure') {
        const dist = calculateDistance(ann.coordinates);
        acc.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${dist.toFixed(2)} km`, strokeType: ann.strokeType || 'solid' }
        });
      } else if (ann.type === 'circle') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, textLabel: `${ann.radius?.toFixed(2)} km`, strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
        });
      } else if (ann.type === 'polygon') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5 }
        });
      } else if (ann.type === 'arrow' && ann.coordinates && ann.coordinates.length === 2) {
        const arrowFeats = createArrowFeatures(ann.coordinates[0], ann.coordinates[1], ann.color || '#ffffff', ann.id);
        if (arrowFeats) {
          arrowFeats.shaft.properties!.strokeType = ann.strokeType || 'solid';
          arrowFeats.head.properties!.strokeType = 'solid';
          acc.push(arrowFeats.shaft, arrowFeats.head);
        }
      } else if (ann.type === 'highlight') {
        if (ann.polygonGeometry && (ann.polygonGeometry.type === 'Polygon' || ann.polygonGeometry.type === 'MultiPolygon')) {
          acc.push({
            type: 'Feature',
            geometry: ann.polygonGeometry,
            properties: { color: ann.color, id: ann.id, type: 'polygon', strokeType: ann.strokeType || 'solid', fillOpacity: ann.fillOpacity ?? 0.5, name: ann.text }
          });
        }
        if (ann.coordinates) {
          acc.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: ann.coordinates },
            properties: { color: ann.color, id: `${ann.id}-label`, type: 'highlight-label', text: ann.text, name: ann.text }
          });
        }
      } else if (ann.type === 'route' && ann.routeGeometry) {
        acc.push({
          type: 'Feature',
          geometry: ann.routeGeometry,
          properties: { color: ann.color, id: ann.id, type: ann.type, strokeType: ann.strokeType || 'solid' }
        });
      } else if (ann.type === 'label' || ann.type === 'icon') {
        acc.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: ann.coordinates },
          properties: { color: ann.color, id: ann.id, type: ann.type, text: ann.text, iconId: ann.iconId, name: ann.text }
        });
      }
      return acc;
    }, []);

    const geojson = {
      type: 'FeatureCollection',
      features
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations_${new Date().toISOString().split('T')[0]}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [annotations]);

  const handleColorSelect = useCallback((color: string) => {
    setCurrentColor(color);
    if (selectedAnnotationId) {
      setAnnotations(prev => prev.map(a => 
        a.id === selectedAnnotationId ? { ...a, color } : a
      ));
    }
  }, [selectedAnnotationId]);

  const handleStrokeTypeSelect = useCallback((strokeType: StrokeType) => {
    setCurrentStrokeType(strokeType);
    if (selectedAnnotationId) {
      setAnnotations(prev => prev.map(a => 
        a.id === selectedAnnotationId ? { ...a, strokeType } : a
      ));
    }
  }, [selectedAnnotationId]);

  const handleFillOpacitySelect = useCallback((opacity: number) => {
    setCurrentFillOpacity(opacity);
    if (selectedAnnotationId) {
      setAnnotations(prev => prev.map(a => 
        a.id === selectedAnnotationId ? { ...a, fillOpacity: opacity } : a
      ));
    }
  }, [selectedAnnotationId]);

  const handleDelete = useCallback(() => {
    if (selectedAnnotationId) {
      setAnnotations(prev => prev.filter(a => a.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
    } else if (activeTool !== 'none') {
      setAnnotations(prev => prev.filter(a => a.type !== activeTool));
    }
  }, [activeTool, selectedAnnotationId]);

  useEffect(() => {
    setSelectedAnnotationId(null);
  }, [activeTool]);

  const handleFlyTo = useCallback((viewId: string, view: NonNullable<Annotation['view']>) => {
    // We need to pass the flyTo trigger down or pass map instance up.
    // Instead of full map ref in App, we can dispatch an event or use a ref.
    // A simple hack: window.mapInstance is often used, but let's pass a CustomEvent
    const event = new CustomEvent('flyToView', { detail: { viewId, view } });
    window.dispatchEvent(event);
  }, []);

  useEffect(() => {
    const handleViewCaptured = (async (e: Event) => {
      const customEvent = e as CustomEvent<AppSettings['defaultView']>;
      setSettings(prev => ({ ...prev, defaultView: customEvent.detail }));
      await customAlert('Default map view captured!');
    }) as EventListener;
    window.addEventListener('viewCaptured', handleViewCaptured);

    const handleViewCapturedForPosition = ((e: Event) => {
      const customEvent = e as CustomEvent<AppSettings['defaultView']>;
      setAnnotations(prev => {
        const positionCount = prev.filter(a => a.type === 'label' && a.text?.startsWith('POSITION ')).length + 1;
        return [...prev, {
          id: `position-${Date.now()}`,
          type: 'label',
          color: currentColor,
          text: `POSITION ${positionCount}`,
          view: customEvent.detail
        }];
      });
    }) as EventListener;
    window.addEventListener('viewCapturedForPosition', handleViewCapturedForPosition);

    const handleViewCapturedForUpdate = ((e: Event) => {
      const customEvent = e as CustomEvent<{ id: string, view: AppSettings['defaultView'] }>;
      const { id, view } = customEvent.detail;
      setAnnotations(prev => prev.map(a => a.id === id ? { ...a, view } : a));
    }) as EventListener;
    window.addEventListener('viewCapturedForUpdate', handleViewCapturedForUpdate);

    const handleViewCapturedForDefaultUpdate = ((e: Event) => {
      const customEvent = e as CustomEvent<AppSettings['defaultView']>;
      setSettings(prev => ({ ...prev, defaultView: customEvent.detail }));
    }) as EventListener;
    window.addEventListener('viewCapturedForDefaultUpdate', handleViewCapturedForDefaultUpdate);

    const handleUpdateAnimationTrigger = ((e: Event) => {
      const customEvent = e as CustomEvent<{ targetId: string, triggerId: string, clearHideTrigger?: boolean }>;
      const { targetId, triggerId, clearHideTrigger } = customEvent.detail;
      setAnnotations(prev => prev.map(a => {
        if (a.id === targetId) {
          const update = { ...a, animationTriggerId: triggerId };
          if (clearHideTrigger) update.hideAnimationTriggerId = undefined;
          return update;
        }
        return a;
      }));
    }) as EventListener;
    window.addEventListener('updateAnimationTrigger', handleUpdateAnimationTrigger);

    const handleUpdateHideAnimationTrigger = ((e: Event) => {
      const customEvent = e as CustomEvent<{ targetId: string, triggerId: string, clearRevealTrigger?: boolean }>;
      const { targetId, triggerId, clearRevealTrigger } = customEvent.detail;
      setAnnotations(prev => prev.map(a => {
        if (a.id === targetId) {
          const update = { ...a, hideAnimationTriggerId: triggerId };
          if (clearRevealTrigger) update.animationTriggerId = undefined;
          return update;
        }
        return a;
      }));
    }) as EventListener;
    window.addEventListener('updateHideAnimationTrigger', handleUpdateHideAnimationTrigger);

    const handleUpdateTemplate = ((e: Event) => {
      const { type, template } = (e as CustomEvent).detail;
      setAnnotations(prev => prev.map(a => {
        if (a.id === selectedAnnotationId) {
          if ((type === 'regular' && a.type === 'label') || (type === 'highlight' && a.type === 'highlight')) {
            return { ...a, template };
          }
        }
        return a;
      }));
    }) as EventListener;
    window.addEventListener('updateSelectedLabelTemplate', handleUpdateTemplate);

    const handleUpdateTheme = ((e: Event) => {
      const { key, value } = (e as CustomEvent).detail;
      setAnnotations(prev => prev.map(a => {
        if (a.id === selectedAnnotationId && (a.type === 'label' || a.type === 'highlight')) {
          return { ...a, theme: { ...(a.theme || {}), [key]: value } };
        }
        return a;
      }));
    }) as EventListener;
    window.addEventListener('updateSelectedLabelTheme', handleUpdateTheme);

    return () => {
      window.removeEventListener('viewCaptured', handleViewCaptured);
      window.removeEventListener('viewCapturedForPosition', handleViewCapturedForPosition);
      window.removeEventListener('viewCapturedForUpdate', handleViewCapturedForUpdate);
      window.removeEventListener('viewCapturedForDefaultUpdate', handleViewCapturedForDefaultUpdate);
      window.removeEventListener('updateAnimationTrigger', handleUpdateAnimationTrigger);
      window.removeEventListener('updateHideAnimationTrigger', handleUpdateHideAnimationTrigger);
      window.removeEventListener('updateSelectedLabelTemplate', handleUpdateTemplate);
      window.removeEventListener('updateSelectedLabelTheme', handleUpdateTheme);
    };
  }, [currentColor, selectedAnnotationId]);

  if (currentView === 'overview') {
    return (
      <OverviewScreen 
        onSelectShow={(showId) => {
          // Update URL without reloading
          const url = new URL(window.location.href);
          url.searchParams.set('show', showId);
          window.history.pushState({}, '', url);
          setCurrentShow(showId);
          setCurrentView('map');
        }}
      />
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-dvw h-dvh bg-black flex flex-col items-center justify-center text-white/50">
        <Loader2 className="animate-spin mb-4 text-white" size={32} />
        <span className="text-sm font-semibold tracking-wider">LOADING MAP DATA...</span>
      </div>
    );
  }

  return (
    <div className="w-dvw h-dvh relative bg-black">
      <MapContainer 
        activeTool={activeTool}
        currentColor={currentColor}
        currentStrokeType={currentStrokeType}
        currentFillOpacity={currentFillOpacity}
        annotations={annotations}
        setAnnotations={setAnnotations}
        labelPrompt={labelPrompt}
        setLabelPrompt={setLabelPrompt}
        headlinePrompt={headlinePrompt}
        setHeadlinePrompt={setHeadlinePrompt}
        setActiveDistance={setActiveDistance}
        selectedAnnotationId={selectedAnnotationId}
        setSelectedAnnotationId={setSelectedAnnotationId}
        settings={settings}
        setSettings={setSettings}
        activeGeojsonLayerId={activeGeojsonLayerId}
        setActiveGeojsonLayerId={setActiveGeojsonLayerId}
        selectedGeojsonFeatureId={selectedGeojsonFeatureId}
        setSelectedGeojsonFeatureId={setSelectedGeojsonFeatureId}
        selectedIconId={selectedIconId}
        routeMode={routeMode}
        isSidebarOpen={isLayerSidebarOpen}
      />
      <SavedViews 
        annotations={annotations}
        onFlyTo={handleFlyTo}
        defaultView={settings.defaultView}
        isSidebarOpen={isLayerSidebarOpen}
        isToolbarOpen={isToolbarOpen}
        onDeleteAnnotation={(id) => setAnnotations(prev => prev.filter(a => a.id !== id))}
        selectedAnnotationId={selectedAnnotationId}
      />
      {/* Floating active distance readout for Measure and Circle tools */}
      {(activeTool === 'measure' || activeTool === 'circle') && activeDistance !== null && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-black text-white px-6 py-3 border border-white/20 flex items-center gap-2 rounded-full shadow-xl">
          <span className="font-semibold text-lg">{activeDistance.toFixed(2)} km</span>
        </div>
      )}

      {/* Bottom Left UI Controls */}
      <div className={`absolute bottom-6 left-6 z-10 flex items-end gap-2 transition-transform duration-300 ease-in-out ${isLayerSidebarOpen ? 'translate-x-[20rem]' : 'translate-x-0'}`}>
        <button 
          onClick={() => setIsLayerSidebarOpen(!isLayerSidebarOpen)}
          className="bg-black w-12 h-12 flex flex-shrink-0 items-center justify-center hover:bg-white hover:text-black transition-colors text-white shadow-lg rounded-full"
          title="Manage Layers"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>

        <Toolbar 
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          currentColor={currentColor}
          setCurrentColor={handleColorSelect}
          currentStrokeType={currentStrokeType}
          setCurrentStrokeType={handleStrokeTypeSelect}
          currentFillOpacity={currentFillOpacity}
          setCurrentFillOpacity={handleFillOpacitySelect}
          routeMode={routeMode}
          setRouteMode={setRouteMode}
          onSave={() => handleSave(false)}
          onExport={handleExport}
          onDelete={handleDelete}
          hasSelection={!!selectedAnnotationId}
          settings={settings}
          isSaving={isSaving}
          isOpen={isToolbarOpen}
          setIsOpen={setIsToolbarOpen}
          selectedIconId={selectedIconId}
          setSelectedIconId={setSelectedIconId}
          onClearSelection={() => setSelectedAnnotationId(null)}
        />
      </div>

      <LayerSidebar 
        settings={settings} 
        setSettings={setSettings} 
        currentShow={currentShow}
        annotations={annotations}
        isOpen={isLayerSidebarOpen} 
        setIsOpen={setIsLayerSidebarOpen} 
        activeGeojsonLayerId={activeGeojsonLayerId}
        setActiveGeojsonLayerId={setActiveGeojsonLayerId}
        selectedGeojsonFeatureId={selectedGeojsonFeatureId}
        onSave={() => handleSave(false)}
        onSaveAndExit={() => handleSave(true)}
        isSaving={isSaving}
      />

      {/* Show Title Overlay */}
      <div className="absolute bottom-8 right-8 z-40 bg-white px-4 py-2 pointer-events-none">
        <span className="text-black font-bold tracking-widest uppercase text-xs">
          {settings.title || currentShow}
        </span>
      </div>

      {labelPrompt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl">
            <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">Add Label</h3>
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                type="text"
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && labelInput.trim()) {
                    const event = new CustomEvent('saveLabel', { detail: { text: labelInput, secondaryText: secondaryLabelInput } });
                    window.dispatchEvent(event);
                  }
                  if (e.key === 'Escape') setLabelPrompt(null);
                }}
                placeholder={activeTool === 'label' ? "Primary text..." : "Enter text..."}
                className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
              />
              {activeTool === 'label' && (
                <input
                  type="text"
                  value={secondaryLabelInput}
                  onChange={e => setSecondaryLabelInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && labelInput.trim()) {
                      const event = new CustomEvent('saveLabel', { detail: { text: labelInput, secondaryText: secondaryLabelInput } });
                      window.dispatchEvent(event);
                    }
                    if (e.key === 'Escape') setLabelPrompt(null);
                  }}
                  placeholder="Secondary text (optional)..."
                  className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
              <button 
                onClick={() => setLabelPrompt(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors rounded-full"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (labelInput.trim()) {
                    const event = new CustomEvent('saveLabel', { detail: { text: labelInput, secondaryText: secondaryLabelInput } });
                    window.dispatchEvent(event);
                  }
                }}
                className="px-4 py-2 bg-white text-black hover:bg-white/90 text-sm transition-colors rounded-full"
              >
                Save Label
              </button>
            </div>
          </div>
        </div>
      )}

      {headlinePrompt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl">
            <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">
              {headlinePrompt.id ? "Edit Headline" : "Add Headline"}
            </h3>
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                type="text"
                value={headlineInput}
                onChange={e => setHeadlineInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (headlineInput.trim() || highlightedLineInput.trim())) {
                    const event = new CustomEvent('saveHeadline', { detail: { text: headlineInput, secondaryText: highlightedLineInput, id: headlinePrompt.id } });
                    window.dispatchEvent(event);
                  }
                  if (e.key === 'Escape') setHeadlinePrompt(null);
                }}
                placeholder="Headline (e.g. TRAGÖDIE IN BERLIN)..."
                className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
              />
              <input
                type="text"
                value={highlightedLineInput}
                onChange={e => setHighlightedLineInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (headlineInput.trim() || highlightedLineInput.trim())) {
                    const event = new CustomEvent('saveHeadline', { detail: { text: headlineInput, secondaryText: highlightedLineInput, id: headlinePrompt.id } });
                    window.dispatchEvent(event);
                  }
                  if (e.key === 'Escape') setHeadlinePrompt(null);
                }}
                placeholder="Highlighted sub-line (optional)..."
                className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
              />
            </div>
            <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
              <button 
                onClick={() => setHeadlinePrompt(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors rounded-full"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (headlineInput.trim() || highlightedLineInput.trim()) {
                    const event = new CustomEvent('saveHeadline', { detail: { text: headlineInput, secondaryText: highlightedLineInput, id: headlinePrompt.id } });
                    window.dispatchEvent(event);
                  }
                }}
                disabled={!headlineInput.trim() && !highlightedLineInput.trim()}
                className="px-4 py-2 bg-white text-black hover:bg-white/90 text-sm font-semibold transition-colors rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {headlinePrompt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl">
            <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">
              {headlinePrompt.id ? "Edit Headline" : "Add Headline"}
            </h3>
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                type="text"
                value={headlineInput}
                onChange={e => setHeadlineInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (headlineInput.trim() || highlightedLineInput.trim())) {
                    const event = new CustomEvent('saveHeadline', { detail: { text: headlineInput, secondaryText: highlightedLineInput, id: headlinePrompt.id } });
                    window.dispatchEvent(event);
                  }
                  if (e.key === 'Escape') {
                    setHeadlinePrompt(null);
                  }
                }}
                placeholder="Headline (e.g. TRAGÖDIE IN BERLIN)..."
                className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
              />
              <input
                type="text"
                value={highlightedLineInput}
                onChange={e => setHighlightedLineInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (headlineInput.trim() || highlightedLineInput.trim())) {
                    const event = new CustomEvent('saveHeadline', { detail: { text: headlineInput, secondaryText: highlightedLineInput, id: headlinePrompt.id } });
                    window.dispatchEvent(event);
                  }
                  if (e.key === 'Escape') {
                    setHeadlinePrompt(null);
                  }
                }}
                placeholder="Highlighted sub-line (optional)..."
                className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
              />
            </div>
            <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
              <button 
                onClick={() => {
                  setHeadlinePrompt(null);
                }}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors rounded-full"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (headlineInput.trim() || highlightedLineInput.trim()) {
                    const event = new CustomEvent('saveHeadline', { detail: { text: headlineInput, secondaryText: highlightedLineInput, id: headlinePrompt.id } });
                    window.dispatchEvent(event);
                  }
                }}
                disabled={!headlineInput.trim() && !highlightedLineInput.trim()}
                className="px-4 py-2 bg-white text-black hover:bg-white/90 text-sm font-semibold transition-colors rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
