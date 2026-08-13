import { useEffect, useCallback } from 'react';
import { MapContainer } from './components/MapContainer';
import { Toolbar } from './components/Toolbar';
import { SavedViews } from './components/SavedViews';
import { OverviewScreen } from './components/OverviewScreen';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';
import type { Annotation } from './types';
import { getAccreditations } from './utils/accreditations';

import { DEFAULT_ICON_CATEGORIES } from './defaultIcons';
import { DEFAULT_SETTINGS } from './constants/defaultSettings';

import { LayerSidebar } from './components/LayerSidebar';
import { GlobalDateControl } from './components/GlobalDateControl';
import { Loader2, Menu } from 'lucide-react';
import { useTranslation } from './contexts/I18nContext';
import { useAppEventListeners } from './hooks/useAppEventListeners';
import { LabelPromptModal } from './components/ui/LabelPromptModal';
import { HeadlinePromptModal } from './components/ui/HeadlinePromptModal';
import { TitleOverlay } from './components/ui/TitleOverlay';
import { useAppActions } from './hooks/useAppActions';
import { useDataLoader } from './hooks/useDataLoader';
import { useAppState } from './hooks/useAppState';
export function App() {
  const { t, language } = useTranslation();
  const {
    activeTool, setActiveTool,
    currentColor, setCurrentColor,
    currentStrokeType, setCurrentStrokeType,
    currentFillOpacity, setCurrentFillOpacity,
    routeMode, setRouteMode,
    annotations, setAnnotations,
    settings, setSettings,
    settingsRef,
    labelPrompt, setLabelPrompt,
    headlinePrompt, setHeadlinePrompt,
    labelInput, setLabelInput,
    secondaryLabelInput, setSecondaryLabelInput,
    headlineInput, setHeadlineInput,
    highlightedLineInput, setHighlightedLineInput,
    activeDistance, setActiveDistance,
    selectedAnnotationId, setSelectedAnnotationId,
    selectedIconId, setSelectedIconId,
    isLayerSidebarOpen, setIsLayerSidebarOpen,
    activeGeojsonLayerId, setActiveGeojsonLayerId,
    selectedGeojsonFeatureId, setSelectedGeojsonFeatureId,
    isToolbarOpen, setIsToolbarOpen,
    isSaving, setIsSaving,
    isLoaded, setIsLoaded,
    currentView, setCurrentView,
    currentShow, setCurrentShow,
    activeCropOverlay, setActiveCropOverlay,
    activeMapViewId, setActiveMapViewId
  } = useAppState(DEFAULT_SETTINGS);

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

  useDataLoader(
    currentView, currentShow,
    setIsLoaded, setIsLayerSidebarOpen, setIsToolbarOpen, setActiveTool,
    setAnnotations, setSettings,
    DEFAULT_SETTINGS, DEFAULT_ICON_CATEGORIES
  );

  const {
    handleSave,
    handleExport,
    handleColorSelect,
    handleStrokeTypeSelect,
    handleFillOpacitySelect,
    handleDelete
  } = useAppActions(
    annotations, setAnnotations,
    settings, setSettings,
    currentShow, setCurrentShow,
    setCurrentView,
    setActiveTool, activeTool,
    selectedAnnotationId, setSelectedAnnotationId,
    setCurrentColor, setCurrentStrokeType, setCurrentFillOpacity,
    setIsSaving,
    t
  );



  const handleFlyTo = useCallback((viewId: string, view: NonNullable<Annotation['view']>) => {
    setActiveMapViewId(viewId);
    
    // Pass the flyTo trigger down
    const event = new CustomEvent('flyToView', { detail: { viewId, view } });
    window.dispatchEvent(event);

    // If we have an active crop overlay, and this view has a keyframe for it, load it!
    if (activeCropOverlay) {
      let targetCropSettings;
      if (viewId === 'overview') {
        targetCropSettings = settingsRef.current.defaultView.cropSettings;
      } else {
        const ann = annotations.find(a => a.id === viewId);
        targetCropSettings = ann?.cropSettings;
      }
      if (targetCropSettings?.[activeCropOverlay]) {
        const cropVal = targetCropSettings[activeCropOverlay];
        if (cropVal) {
          setSettings(prevSettings => ({
            ...prevSettings,
            exportCropSettings: {
              ...(prevSettings.exportCropSettings || {} as any),
              [activeCropOverlay]: cropVal
            } as any
          }));
        }
      }
    }
  }, [activeCropOverlay, annotations]);

  useAppEventListeners(currentColor, selectedAnnotationId, settingsRef, setSettings, setAnnotations);

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

  const accreditationLines = getAccreditations(settings.layers, language);

  const hasDateLayers = settings.layers.some(
    layer => ["deepstate", "gdacs_earthquakes", "gdacs_volcanoes", "gdacs_cyclones", "wildfires", "nighttime", "weather_forecast"].includes(layer.type) || layer.id === "floods"
  );

  return (
    <div className={`w-dvw h-dvh relative overflow-hidden ${settings.uiTheme === 'light' ? 'theme-light' : 'theme-dark'} ${settings.uiLiquidGlass ? 'theme-glass' : ''} bg-ui-bg`}>
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
        isToolbarOpen={isToolbarOpen}
        activeCropOverlay={activeCropOverlay}
      />
      <SavedViews 
        annotations={annotations}
        onFlyTo={handleFlyTo}
        defaultView={settings.defaultView}
        isSidebarOpen={isLayerSidebarOpen}
        isToolbarOpen={isToolbarOpen}
        activeCropOverlay={activeCropOverlay}
        onRenameAnnotationButton={(id, newName) => {
          setAnnotations(prev => prev.map(a => a.id === id ? { ...a, buttonText: newName } : a));
        }}
        onRenameOverviewButton={(newName) => {
          setSettings(prev => ({ ...prev, defaultView: { ...prev.defaultView, buttonText: newName } }));
        }}
        onDeleteAnnotation={(id) => {
          setAnnotations(prev => {
            const next = prev.map(a => {
              if (a.id === id) {
                const newA = { ...a };
                delete newA.view;
                return newA;
              }
              return a;
            }).filter(a => a.view || a.coordinates || a.polygonGeometry || a.routeGeometry);

            return next.map(a => {
              let updated = false;
              const newA = { ...a };
              if (newA.animationTriggerId === id) {
                newA.animationTriggerId = undefined;
                updated = true;
              }
              if (newA.hideAnimationTriggerId === id) {
                newA.hideAnimationTriggerId = undefined;
                updated = true;
              }
              return updated ? newA : a;
            });
          });

          setSettings(prev => {
            const updateLayers = (layers: any[]): any[] => {
              return layers.map(l => {
                let updated = false;
                const newL = { ...l };
                if (newL.animationTriggerId === id) {
                  newL.animationTriggerId = undefined;
                  updated = true;
                }
                if (newL.hideAnimationTriggerId === id) {
                  newL.hideAnimationTriggerId = undefined;
                  updated = true;
                }
                if (newL.children) {
                  newL.children = updateLayers(newL.children);
                  if (newL.children !== l.children) updated = true;
                }
                return updated ? newL : l;
              });
            };
            return {
              ...prev,
              layers: updateLayers(prev.layers)
            };
          });
        }}
        onReorderAnnotations={(reorderedIds) => setAnnotations(prev => {
          const newAnns = [...prev];
          const indices: number[] = [];
          prev.forEach((a, i) => {
            if ((a.type === 'label' || a.type === 'highlight') && a.text && a.view) {
              indices.push(i);
            }
          });
          indices.forEach((index, i) => {
            const idToPlace = reorderedIds[i];
            const ann = prev.find(a => a.id === idToPlace);
            if (ann) {
              newAnns[index] = ann;
            }
          });
          return newAnns;
        })}
        selectedAnnotationId={selectedAnnotationId}
      />
      {/* Floating active distance readout for Measure and Circle tools */}
      {(activeTool === 'measure' || activeTool === 'circle') && activeDistance !== null && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 bg-black text-white px-6 py-3 border border-white/20 flex items-center gap-2 rounded-full shadow-xl">
          <span className="font-semibold text-lg">{activeDistance.toFixed(2)} km</span>
        </div>
      )}

      {/* Bottom Left UI Controls */}
      <div id="global-toolbar-container" className={`absolute left-6 z-10 flex items-end gap-2 transition-all duration-300 ease-in-out ${isLayerSidebarOpen ? 'translate-x-[20rem]' : 'translate-x-0'}`} style={{ bottom: `${24 + (settings.uiBottomPadding || 0)}px` }}>
        <button 
          onClick={() => setIsLayerSidebarOpen(!isLayerSidebarOpen)}
          className="relative w-12 h-12 flex flex-shrink-0 items-center justify-center transition-colors bg-black text-ui-text hover:text-ui-bg shadow-lg rounded-full ui-glass-panel group"
          title="Manage Layers"
        >
          <div className="absolute inset-0 rounded-full transition-colors group-hover:bg-ui-text z-0"></div>
          <div className="relative z-10 flex items-center justify-center">
            <Menu size={20} strokeWidth={1.5} />
          </div>
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
          onDelete={handleDelete}
          hasSelection={selectedAnnotationId !== null}
          hasAnnotations={annotations.some(a => a.coordinates || a.polygonGeometry || a.routeGeometry)}
          settings={settings}
          isOpen={isToolbarOpen}
          setIsOpen={setIsToolbarOpen}
          selectedIconId={selectedIconId}
          setSelectedIconId={setSelectedIconId}
          onClearSelection={() => setSelectedAnnotationId(null)}
        />
      </div>

      {/* Bottom Center UI Controls */}
      <AnimatePresence>
        {hasDateLayers && (
          <motion.div 
            key="global-date-control"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute z-10 pointer-events-none transition-all duration-300 ease-in-out"
            style={{ 
              left: `calc(50% + ${(isLayerSidebarOpen ? 160 : 0) + (isToolbarOpen ? 230 : 0)}px)`, 
              transform: 'translateX(-50%)',
              bottom: `${24 + (settings.uiBottomPadding || 0)}px`
            }}
          >
            <div id="global-date-control-container" className="pointer-events-auto flex justify-center">
              <GlobalDateControl 
                mode={settings.globalDateMode || 'single'}
                onModeChange={(m) => setSettings(s => ({ ...s, globalDateMode: m, layers: s.layers.map(l => ({ ...l, _isDirty: true })) }))}
                startDate={settings.globalStartDate || 'today'}
                onStartDateChange={(d) => setSettings(s => ({ ...s, globalStartDate: d, layers: s.layers.map(l => ({ ...l, _isDirty: true })) }))}
                endDate={settings.globalEndDate || 'today'}
                onEndDateChange={(d) => setSettings(s => ({ ...s, globalEndDate: d, layers: s.layers.map(l => ({ ...l, _isDirty: true })) }))}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <LayerSidebar 
        activeMapViewId={activeMapViewId}
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
        onExport={handleExport}
        isSaving={isSaving}
        activeCropOverlay={activeCropOverlay}
        setActiveCropOverlay={setActiveCropOverlay}
      />

      <TitleOverlay 
        settings={settings} 
        currentShow={currentShow} 
        accreditationLines={accreditationLines} 
      />

      <LabelPromptModal 
        labelPrompt={labelPrompt}
        setLabelPrompt={setLabelPrompt}
        labelInput={labelInput}
        setLabelInput={setLabelInput}
        secondaryLabelInput={secondaryLabelInput}
        setSecondaryLabelInput={setSecondaryLabelInput}
        activeTool={activeTool}
      />

      <HeadlinePromptModal
        headlinePrompt={headlinePrompt}
        setHeadlinePrompt={setHeadlinePrompt}
        headlineInput={headlineInput}
        setHeadlineInput={setHeadlineInput}
        highlightedLineInput={highlightedLineInput}
        setHighlightedLineInput={setHighlightedLineInput}
      />

    </div>
  );
}

export default App;
