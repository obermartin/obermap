import { useEffect } from 'react';
import type { Annotation, AppSettings, MapLayer } from '../types';

export const useDataLoader = (
  currentView: 'overview' | 'map',
  currentShow: string | null,
  setIsLoaded: React.Dispatch<React.SetStateAction<boolean>>,
  setIsLayerSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setIsToolbarOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setActiveTool: React.Dispatch<React.SetStateAction<any>>,
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>,
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
  DEFAULT_SETTINGS: AppSettings,
  DEFAULT_ICON_CATEGORIES: any[]
) => {
  useEffect(() => {
    if (currentView !== 'map' || !currentShow) return;
    
    setIsLoaded(false);
    
    // Load from backend
    fetch(`./api.php?show=${currentShow}&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        setIsLayerSidebarOpen(false);
        setIsToolbarOpen(false);
        setActiveTool('none');
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
              if (merged.id === 'floods' && merged.name !== 'Floods (GloFAS)') {
                merged.name = 'Floods (GloFAS)';
              }

              const defaultMatch = DEFAULT_SETTINGS.layers.find(l => l.id === merged.id);
              if (defaultMatch) {
                merged = { ...defaultMatch, ...merged, data: defaultMatch.data || merged.data };
              }

              if (merged.id === 'weather_forecast') {
                merged.showWindLegend = merged.showWindLegend !== false;
                merged.windParticleTrailBySpeed = merged.windParticleTrailBySpeed === true;
              }

              if (merged.type === 'split' && merged.splitLayers) {
                merged.splitLayers = merged.splitLayers.filter(Boolean).map(processSavedLayer);
              }

              if (merged.type === 'geojson' && merged.data && merged.data.features) {
                merged.data.features.forEach((f: any) => {
                  if (!f.properties) f.properties = {};
                  if (!f.properties.id) f.properties.id = `feature-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                });
              }
              
              return merged;
            };

            const mergedLayers = savedLayers.map(processSavedLayer);

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
  }, [
    currentView, currentShow, setIsLoaded, setIsLayerSidebarOpen, 
    setIsToolbarOpen, setActiveTool, setAnnotations, setSettings, 
    DEFAULT_SETTINGS, DEFAULT_ICON_CATEGORIES
  ]);
};
