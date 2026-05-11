import { useState, useEffect, useCallback } from 'react';
import { MapContainer } from './components/MapContainer';
import { Toolbar } from './components/Toolbar';
import { SavedViews } from './components/SavedViews';
import { OverviewScreen } from './components/OverviewScreen';
import type { Annotation, ToolType, StrokeType, AppSettings, MapLayer } from './types';

const DEFAULT_SETTINGS: AppSettings = {
  mapboxToken: 'pk.eyJ1Ijoib2Jlcm1hcnRpbiIsImEiOiJja25ybGlpYTgyNDRhMnVwcmo5eml4ZGdzIn0.W_ZjSsvTOlZs-Xd7m72DIQ',
  mapboxStyle: 'mapbox://styles/obermartin/cmor4oid5000n01qphyjgg4u7',
  defaultView: {
    center: [35.0, 48.5],
    zoom: 5,
    pitch: 45,
    bearing: 0
  },
  colorPalette: ['#DD0000', '#F15A38', '#F9A03F', '#F8DE22', '#8CC63F', '#009245', '#00A79D', '#27AAE1', '#2B3990', '#662D91', '#9E1F63'],
  icons: [
    { id: 'pin', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>' },
    { id: 'star', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
    { id: 'flag', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>' }
  ],
  labelDensity: 50,
  layers: [
    { id: 'split-container', name: 'Split View Container', type: 'split', visible: false, splitPosition: 0.5, splitDirection: 'vertical', splitLayers: [] },
    { id: 'deepstate', name: 'UKRAINE CURRENT', type: 'deepstate', visible: false, isLive: true },
    { id: 'copernicus', name: 'Wildfires (EFFIS)', type: 'raster', visible: false, url: 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}' },
    { id: 'satellite', name: 'Satellite Map Overlay (Mapbox)', type: 'satellite', visible: false },
    { id: 'flights', name: 'Air Traffic (OpenSky)', type: 'flights', visible: false }
  ]
};

import { LayerSidebar } from './components/LayerSidebar';
import { Layers, Loader2 } from 'lucide-react';

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('none');
  const [currentColor, setCurrentColor] = useState<string>('#DD0000');
  const [currentStrokeType, setCurrentStrokeType] = useState<StrokeType>('solid');
  const [currentFillOpacity, setCurrentFillOpacity] = useState<number>(0.5);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [labelPrompt, setLabelPrompt] = useState<{ lngLat: [number, number] } | null>(null);
  const [activeDistance, setActiveDistance] = useState<number | null>(null);
  const [labelInput, setLabelInput] = useState('');
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
    fetch(`./api.php?show=${currentShow}`)
      .then(res => res.json())
      .then(data => {
        if (data.annotations) {
          setAnnotations(data.annotations);
        }
        if (data.settings) {
          setSettings(prev => {
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
              const defaultMatch = prev.layers.find(l => l.id === merged.id);
              if (defaultMatch) {
                merged = { ...defaultMatch, ...merged, data: defaultMatch.data || merged.data };
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

            // We no longer forcefully inject mandatory layers here. 
            // Users can now toggle them manually via the App Config menu.
            return { ...prev, ...data.settings, layers: mergedLayers };
          });
        }
      })
      .catch(err => console.error('Error loading data:', err))
      .finally(() => setIsLoaded(true));
  }, [currentView, currentShow]);

  const handleSave = useCallback((andExit = false) => {
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
      .then(() => {
        alert('Annotations & Settings saved successfully!');
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
      .catch(err => {
        console.error('Error saving data:', err);
        alert('Failed to save data.');
      })
      .finally(() => setIsSaving(false));
    } catch (err) {
      console.error('Error during layer optimization:', err);
      alert('Failed to save data due to an internal error.');
      setIsSaving(false);
    }
  }, [annotations, settings, currentShow]);

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

  const handleFlyTo = useCallback((view: NonNullable<Annotation['view']>) => {
    // We need to pass the flyTo trigger down or pass map instance up.
    // Instead of full map ref in App, we can dispatch an event or use a ref.
    // A simple hack: window.mapInstance is often used, but let's pass a CustomEvent
    const event = new CustomEvent('flyToView', { detail: view });
    window.dispatchEvent(event);
  }, []);

  useEffect(() => {
    const handleViewCaptured = ((e: CustomEvent<AppSettings['defaultView']>) => {
      setSettings(prev => ({ ...prev, defaultView: e.detail }));
      alert('Default map view captured!');
    }) as EventListener;
    window.addEventListener('viewCaptured', handleViewCaptured);

    const handleViewCapturedForPosition = ((e: CustomEvent<AppSettings['defaultView']>) => {
      setAnnotations(prev => {
        const positionCount = prev.filter(a => a.type === 'label' && a.text?.startsWith('POSITION ')).length + 1;
        return [...prev, {
          id: `position-${Date.now()}`,
          type: 'label',
          color: currentColor,
          text: `POSITION ${positionCount}`,
          view: e.detail
        }];
      });
    }) as EventListener;
    window.addEventListener('viewCapturedForPosition', handleViewCapturedForPosition);

    return () => {
      window.removeEventListener('viewCaptured', handleViewCaptured);
      window.removeEventListener('viewCapturedForPosition', handleViewCapturedForPosition);
    };
  }, [currentColor]);

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
        setActiveDistance={setActiveDistance}
        selectedAnnotationId={selectedAnnotationId}
        setSelectedAnnotationId={setSelectedAnnotationId}
        settings={settings}
        activeGeojsonLayerId={activeGeojsonLayerId}
        setActiveGeojsonLayerId={setActiveGeojsonLayerId}
        selectedGeojsonFeatureId={selectedGeojsonFeatureId}
        setSelectedGeojsonFeatureId={setSelectedGeojsonFeatureId}
        selectedIconId={selectedIconId}
      />
      <SavedViews 
        annotations={annotations}
        onFlyTo={handleFlyTo}
        defaultView={settings.defaultView}
        isSidebarOpen={isLayerSidebarOpen}
        isToolbarOpen={isToolbarOpen}
      />
      {/* Floating active distance readout for Measure and Circle tools */}
      {(activeTool === 'measure' || activeTool === 'circle') && activeDistance !== null && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-black text-white px-6 py-3 border border-white/20 flex items-center gap-2">
          <span className="font-semibold text-lg">{activeDistance.toFixed(2)} km</span>
        </div>
      )}

      {/* Bottom Left UI Controls */}
      <div className={`absolute bottom-6 left-6 z-10 flex items-end gap-2 transition-transform duration-300 ease-in-out ${isLayerSidebarOpen ? 'translate-x-[20rem]' : 'translate-x-0'}`}>
        <button 
          onClick={() => setIsLayerSidebarOpen(!isLayerSidebarOpen)}
          className="bg-black w-12 h-12 flex flex-shrink-0 items-center justify-center hover:bg-white hover:text-black transition-colors text-white shadow-lg"
          title="Manage Layers"
        >
          <Layers size={20} strokeWidth={1.5} />
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
          onSave={handleSave}
          onDelete={handleDelete}
          hasSelection={!!selectedAnnotationId}
          settings={settings}
          isSaving={isSaving}
          isOpen={isToolbarOpen}
          setIsOpen={setIsToolbarOpen}
          selectedIconId={selectedIconId}
          setSelectedIconId={setSelectedIconId}
        />
      </div>

      <LayerSidebar 
        settings={settings} 
        setSettings={setSettings} 
        isOpen={isLayerSidebarOpen} 
        setIsOpen={setIsLayerSidebarOpen} 
        activeGeojsonLayerId={activeGeojsonLayerId}
        setActiveGeojsonLayerId={setActiveGeojsonLayerId}
        selectedGeojsonFeatureId={selectedGeojsonFeatureId}
        onSave={() => handleSave(false)}
        onSaveAndExit={() => handleSave(true)}
        isSaving={isSaving}
      />

      {labelPrompt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[300px]">
            <h3 className="text-white font-semibold text-lg">Add Label</h3>
            <input
              autoFocus
              type="text"
              value={labelInput}
              onChange={e => setLabelInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && labelInput.trim()) {
                  // Save label logic
                  const event = new CustomEvent('saveLabel', { detail: labelInput });
                  window.dispatchEvent(event);
                }
                if (e.key === 'Escape') setLabelPrompt(null);
              }}
              placeholder="Enter text..."
              className="w-full bg-black border border-white/20 px-4 py-3 text-white focus:outline-none focus:border-white transition-colors"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button 
                onClick={() => setLabelPrompt(null)}
                className="px-4 py-2 text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (labelInput.trim()) {
                    const event = new CustomEvent('saveLabel', { detail: labelInput });
                    window.dispatchEvent(event);
                  }
                }}
                className="px-4 py-2 bg-white text-black font-semibold hover:bg-white/90 transition-colors"
              >
                Save Label
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
