import { useState, useEffect, useCallback } from 'react';
import { MapContainer } from './components/MapContainer';
import { Toolbar } from './components/Toolbar';
import { SavedViews } from './components/SavedViews';
import type { Annotation, ToolType, AppSettings } from './types';

const DEFAULT_SETTINGS: AppSettings = {
  mapboxToken: 'pk.eyJ1Ijoib2Jlcm1hcnRpbiIsImEiOiJja25ybGlpYTgyNDRhMnVwcmo5eml4ZGdzIn0.W_ZjSsvTOlZs-Xd7m72DIQ',
  mapboxStyle: 'mapbox://styles/mapbox/dark-v11',
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
  labelDensity: 50
};

function App() {
  const [activeTool, setActiveTool] = useState<ToolType>('none');
  const [currentColor, setCurrentColor] = useState<string>('#DD0000');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [labelPrompt, setLabelPrompt] = useState<{ lngLat: [number, number] } | null>(null);
  const [activeDistance, setActiveDistance] = useState<number | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  useEffect(() => {
    // Load from backend
    fetch('./api.php')
      .then(res => res.json())
      .then(data => {
        if (data.annotations) {
          setAnnotations(data.annotations);
        }
        if (data.settings) {
          setSettings(data.settings);
        }
      })
      .catch(err => console.error('Error loading data:', err));
  }, []);

  const handleSave = useCallback(() => {
    fetch('./api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations, settings })
    })
    .then(res => res.json())
    .then(() => alert('Annotations & Settings saved successfully!'))
    .catch(err => {
      console.error('Error saving data:', err);
      alert('Failed to save data.');
    });
  }, [annotations, settings]);

  const handleColorSelect = useCallback((color: string) => {
    setCurrentColor(color);
    if (selectedAnnotationId) {
      setAnnotations(prev => prev.map(a => 
        a.id === selectedAnnotationId ? { ...a, color } : a
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
    return () => window.removeEventListener('viewCaptured', handleViewCaptured);
  }, []);

  return (
    <div className="w-dvw h-dvh relative bg-black">
      <MapContainer 
        activeTool={activeTool}
        currentColor={currentColor}
        annotations={annotations}
        setAnnotations={setAnnotations}
        labelPrompt={labelPrompt}
        setLabelPrompt={setLabelPrompt}
        setActiveDistance={setActiveDistance}
        selectedAnnotationId={selectedAnnotationId}
        setSelectedAnnotationId={setSelectedAnnotationId}
        settings={settings}
      />
      <SavedViews 
        annotations={annotations}
        onFlyTo={handleFlyTo}
        defaultView={settings.defaultView}
      />
      <Toolbar 
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        currentColor={currentColor}
        setCurrentColor={handleColorSelect}
        onSave={handleSave}
        onDelete={handleDelete}
        hasSelection={!!selectedAnnotationId}
        settings={settings}
        setSettings={setSettings}
      />

      {/* Floating active distance readout for Measure and Circle tools */}
      {(activeTool === 'measure' || activeTool === 'circle') && activeDistance !== null && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-black text-white px-6 py-3 border border-white/20 flex items-center gap-2">
          <span className="font-semibold text-lg">{activeDistance.toFixed(2)} km</span>
        </div>
      )}

      {/* Label Density Slider */}
      <div className="absolute top-[72px] right-6 z-10 bg-black border border-white/10 border-t-0 w-[48px] h-36 flex items-center justify-center">
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={settings.labelDensity ?? 50} 
          onChange={e => setSettings(prev => ({ ...prev, labelDensity: Number(e.target.value) }))}
          className="w-[110px] accent-white h-1 bg-white/20 appearance-none cursor-pointer -rotate-90"
          title="Map Label Density"
        />
      </div>

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
