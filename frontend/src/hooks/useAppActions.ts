import { useCallback } from 'react';
import type { Annotation, AppSettings, MapLayer, StrokeType, ToolType } from '../types';
import { calculateDistance, createArrowFeatures } from '../utils/mapUtils';
import { customAlert, customConfirm } from '../utils/dialogService';
import { TOOLS } from '../components/Toolbar';

export const useAppActions = (
  annotations: Annotation[],
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>,
  settings: AppSettings,
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>,
  currentShow: string | null,
  setCurrentShow: React.Dispatch<React.SetStateAction<string | null>>,
  setCurrentView: React.Dispatch<React.SetStateAction<'overview' | 'map'>>,
  setActiveTool: React.Dispatch<React.SetStateAction<ToolType>>,
  activeTool: ToolType,
  selectedAnnotationId: string | null,
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>,
  setCurrentColor: React.Dispatch<React.SetStateAction<string>>,
  setCurrentStrokeType: React.Dispatch<React.SetStateAction<StrokeType>>,
  setCurrentFillOpacity: React.Dispatch<React.SetStateAction<number>>,
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>,
  t: (key: string, options?: any) => string
) => {
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
      let previewData = settings.previewData;
      if (settings.isTemplate || currentShow === '_DEFAULT') {
        const canvas = document.querySelector('canvas.maplibregl-canvas') as HTMLCanvasElement;
        if (canvas) {
          previewData = canvas.toDataURL('image/jpeg', 0.5);
        }
      }

      const optimizedSettings = {
        ...settings,
        previewData,
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
          setActiveTool('none');
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
  }, [annotations, settings, currentShow, setIsSaving, setSettings, setCurrentShow, setCurrentView, setActiveTool, t]);

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
  }, [selectedAnnotationId, setCurrentColor, setAnnotations]);

  const handleStrokeTypeSelect = useCallback((strokeType: StrokeType) => {
    setCurrentStrokeType(strokeType);
    if (selectedAnnotationId) {
      setAnnotations(prev => prev.map(a => 
        a.id === selectedAnnotationId ? { ...a, strokeType } : a
      ));
    }
  }, [selectedAnnotationId, setCurrentStrokeType, setAnnotations]);

  const handleFillOpacitySelect = useCallback((opacity: number) => {
    setCurrentFillOpacity(opacity);
    if (selectedAnnotationId) {
      setAnnotations(prev => prev.map(a => 
        a.id === selectedAnnotationId ? { ...a, fillOpacity: opacity } : a
      ));
    }
  }, [selectedAnnotationId, setCurrentFillOpacity, setAnnotations]);

  const handleDelete = useCallback(async () => {
    if (selectedAnnotationId) {
      setAnnotations(prev => prev.filter(a => a.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
    } else if (activeTool !== 'none') {
      const hasAnnotationsOfType = annotations.some(a => a.type === activeTool);
      if (!hasAnnotationsOfType) return;

      const toolObj = TOOLS.find(t => t.id === activeTool);
      const typeLabel = toolObj ? t(toolObj.label) : activeTool;
      const message = t("This will delete all {{type}} annotations. Are you sure?", { type: typeLabel });
      const confirmed = await customConfirm(message, { confirmLabel: "Yes", cancelLabel: "No" });
      if (confirmed) {
        setAnnotations(prev => prev.filter(a => {
          if (a.type !== activeTool) return true;
          if (activeTool === 'label' && !a.coordinates) return true;
          return false;
        }));
      }
    }
  }, [selectedAnnotationId, activeTool, annotations, t, setAnnotations, setSelectedAnnotationId]);

  return {
    handleSave,
    handleExport,
    handleColorSelect,
    handleStrokeTypeSelect,
    handleFillOpacitySelect,
    handleDelete
  };
};
