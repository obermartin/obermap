import React, { useRef, useState, useEffect } from 'react';
import { Reorder, useDragControls, motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Eye, EyeOff, Upload, Link, X, Layers, Trash2, Edit2, Square, RefreshCcw, RotateCcw, Copy, Radio, Settings, Save, Loader2, Image as ImageIcon, ChevronDown, ChevronRight, Video, BookmarkPlus } from 'lucide-react';
import type { AppSettings, MapLayer } from '../types';
import { parseMapFileWithIds } from '../utils/fileUtils';
import { customAlert, customConfirm, customPrompt } from '../utils/dialogService';
import { useTranslation } from '../contexts/I18nContext';

const DEFAULT_LAYERS: MapLayer[] = [
  { id: 'split-container', name: 'Split View Container', type: 'split', visible: false, splitPosition: 0.5, splitDirection: 'vertical', splitLayers: [] },
  { id: 'deepstate', name: 'UKRAINE CURRENT', type: 'deepstate', visible: false, isLive: true },
  { id: 'copernicus', name: 'Wildfires (EFFIS)', type: 'raster', visible: false, url: 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}' },
  { id: 'flights', name: 'Air Traffic (OpenSky)', type: 'flights', visible: false },
  { id: 'vessels', name: 'Maritime Traffic (AIS)', type: 'vessels', visible: false },
  { id: 'wind', name: 'Wind (Open-Meteo)', type: 'wind', visible: true, windOpacity: 1, windParticleSize: 1.5, windParticleTrail: 94, showWindParticles: true, showWindArrows: false, showWindLegend: true, windParticleSizeBySpeed: true, windParticleSpeedBySpeed: true, windParticleTrailBySpeed: false, windParticleColorBySpeed: true },
  { id: 'weather_forecast', name: 'Weather Forecast (Open-Meteo)', type: 'weather_forecast', visible: false, showTemperature: true, showPrecipitation: false },
  { id: 'google_satellite', name: 'Satellite View (Google)', type: 'raster', visible: false, url: 'https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}' },
  { id: 'bing_satellite', name: 'Satellite View (Bing)', type: 'raster', visible: false, url: 'https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=685&mkt=en-us&n=z' },
  { id: 'satellite', name: 'Satellite View (Mapbox)', type: 'satellite', visible: false },
  { id: 'population_density', name: 'Population Density', type: 'raster', visible: false, url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png' }
];

const CategoryItem = ({ category, catIndex, expandedCategories, setExpandedCategories, setSettings }: any) => {
  const { t } = useTranslation();
  const controls = useDragControls();
  const isExpanded = expandedCategories[category.id] ?? false;

  return (
    <Reorder.Item 
      key={category.id} 
      value={category} 
      dragListener={false} 
      dragControls={controls} 
      className="flex flex-col gap-[2px] w-full"
    >
      <div className="relative p-3 flex items-center justify-between gap-3 bg-black">
        <div className="flex items-center gap-2 flex-1">
          <div onPointerDown={(e) => controls.start(e)} className="cursor-grab active:cursor-grabbing shrink-0 flex items-center p-1">
            <GripVertical size={14} className="text-white/30" />
          </div>
          <button 
            onClick={() => setExpandedCategories((prev: any) => ({ ...prev, [category.id]: !isExpanded }))}
            className="p-1 transition-colors text-white/50 hover:text-white shrink-0"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <input
            type="text"
            value={category.name}
            onChange={(e) => {
              const newName = e.target.value;
              setSettings((prev: any) => {
                const newIcons = [...(prev.icons || [])];
                newIcons[catIndex] = { ...category, name: newName };
                return { ...prev, icons: newIcons };
              });
            }}
            className="bg-transparent text-sm font-semibold tracking-wide text-white focus:outline-none w-full"
          />
        </div>
        <button 
          onClick={async () => {
            const confirmed = await customConfirm(t('Delete category "{{name}}" and all its icons?', { name: category.name }));
            if (confirmed) {
              setSettings((prev: any) => {
                const newIcons = [...(prev.icons || [])];
                newIcons.splice(catIndex, 1);
                return { ...prev, icons: newIcons };
              });
            }
          }}
          className="text-white/30 hover:text-white transition-colors p-1 shrink-0"
          title={t("Delete Category")}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {isExpanded && (
        <div className="flex flex-wrap gap-2 items-center p-3 bg-black" onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-2 items-center">
            {category.icons?.map((iconObj: any, index: number) => (
              <div
                key={iconObj.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', index.toString());
                  e.currentTarget.style.opacity = '0.5';
                }}
                onDragEnd={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                onDragOver={(e) => {
                  e.preventDefault(); // Necessary to allow dropping
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                  const toIndex = index;
                  if (fromIndex === toIndex || isNaN(fromIndex)) return;
                  
                  setSettings((prev: any) => {
                    const newCategories = [...(prev.icons || [])];
                    const newIcons = [...(category.icons || [])];
                    const [movedItem] = newIcons.splice(fromIndex, 1);
                    newIcons.splice(toIndex, 0, movedItem);
                    newCategories[catIndex] = { ...category, icons: newIcons };
                    return { ...prev, icons: newCategories };
                  });
                }}
                className="w-10 h-10 relative group cursor-grab active:cursor-grabbing flex items-center justify-center bg-black text-white shrink-0"
              >
                <div className="w-full h-full p-2 icon-svg-wrapper pointer-events-none" dangerouslySetInnerHTML={{ __html: iconObj.svg }} />
                <button 
                  onClick={() => {
                    setSettings((prev: any) => {
                      const newCategories = [...(prev.icons || [])];
                      newCategories[catIndex] = { 
                        ...category, 
                        icons: category.icons.filter((i: any) => i.id !== iconObj.id) 
                      };
                      return { ...prev, icons: newCategories };
                    });
                  }}
                  className="absolute inset-0 bg-white text-black hidden group-hover:flex items-center justify-center text-xs font-bold transition-opacity"
                  title={t("Remove icon")}
                >
                  ×
                </button>
              </div>
            ))}
            
            <label className="w-10 h-10 border border-white flex items-center justify-center bg-black text-white hover:bg-white hover:text-black transition-colors shrink-0 cursor-pointer" title={t("Upload SVG Icon to this Category")}>
              +
              <input 
                type="file" 
                accept=".svg" 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const text = event.target?.result as string;
                    if (text.includes('<svg')) {
                      const newIcon = { id: `icon-${Date.now()}`, svg: text };
                      setSettings((prev: any) => {
                        const newCategories = [...(prev.icons || [])];
                        newCategories[catIndex] = { 
                          ...category,
                          icons: [...(category.icons || []), newIcon]
                        };
                        return { ...prev, icons: newCategories };
                      });
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </label>
          </div>
        </div>
      )}
    </Reorder.Item>
  );
};

interface LayerSidebarProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  annotations?: any[];
  currentShow?: string | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedGeojsonFeatureId: string | number | null;
  onSave?: () => void;
  onSaveAndExit?: () => void;
  isSaving?: boolean;
}

export function LayerSidebar({
  settings,
  setSettings,
  annotations,
  currentShow,
  isOpen,
  setIsOpen,
  activeGeojsonLayerId,
  setActiveGeojsonLayerId,
  selectedGeojsonFeatureId,
  onSave,
  onSaveAndExit,
  isSaving
}: LayerSidebarProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [activeTab, setActiveTab] = useState<'layers' | 'icons' | 'basemap' | 'video'>('layers');
  const [isDraggingLayer, setIsDraggingLayer] = useState(false);
  const [showPresetLayers, setShowPresetLayers] = useState(false);
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
  const [selectedVesselMmsi, setSelectedVesselMmsi] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  
  // Video Export State
  const [videoFormat, setVideoFormat] = useState<'16x9' | '9x16' | 'both'>('16x9');
  const [videoDuration, setVideoDuration] = useState<number>(3);
  const [dynamicLabels, setDynamicLabels] = useState<boolean>(true);
  const [videoBitrate, setVideoBitrate] = useState<number>(15);

  useEffect(() => {
    const handler = (e: CustomEvent<string | null>) => setSelectedAircraftId(e.detail);
    window.addEventListener('aircraftSelected', handler as EventListener);
    
    const vesselHandler = (e: CustomEvent<string | null>) => setSelectedVesselMmsi(e.detail);
    window.addEventListener('vesselSelected', vesselHandler as EventListener);
    
    return () => {
      window.removeEventListener('aircraftSelected', handler as EventListener);
      window.removeEventListener('vesselSelected', vesselHandler as EventListener);
    };
  }, []);

  const saveAsPreset = (layerToSave: MapLayer) => {
    const newPreset: MapLayer = {
      ...layerToSave,
      id: `${layerToSave.id}_preset_${Date.now()}`,
      visible: false,
      _isDirty: undefined
    };
    setSettings(prev => ({
      ...prev,
      presetLayers: [...(prev.presetLayers || []), newPreset]
    }));
    customAlert(t("Layer saved as preset successfully!"));
  };

  const toggleDefaultLayer = (defaultLayer: MapLayer) => {
    const exists = settings.layers.some(l => l.id === defaultLayer.id);
    if (exists) {
      setSettings(prev => ({ ...prev, layers: prev.layers.filter(l => l.id !== defaultLayer.id), _isDirty: true }));
    } else {
      setSettings(prev => ({ ...prev, layers: [...prev.layers, { ...defaultLayer, visible: true }], _isDirty: true }));
    }
  };



  const [addingColor, setAddingColor] = useState(false);
  const [newColorHex, setNewColorHex] = useState('#000000');

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  


  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragItem.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleColorDragEnd = () => {
    const fromIndex = dragItem.current;
    const toIndex = dragOverItem.current;

    if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
      setSettings(prev => {
        const newColors = [...prev.colorPalette];
        const draggedColor = newColors[fromIndex];
        newColors.splice(fromIndex, 1);
        newColors.splice(toIndex, 0, draggedColor);
        return { ...prev, colorPalette: newColors };
      });
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const confirmAddColor = async () => {
    if (/^#[0-9A-F]{6}$/i.test(newColorHex)) {
      setSettings(prev => ({ ...prev, colorPalette: [...prev.colorPalette, newColorHex.toUpperCase()] }));
      setAddingColor(false);
    } else {
      await customAlert(t('Invalid hex color format. Use #RRGGBB'));
    }
  };

  const removeColor = (color: string) => {
    setSettings(prev => ({ ...prev, colorPalette: prev.colorPalette.filter(c => c !== color) }));
  };

  const updateLayerRecursively = (layers: MapLayer[], targetId: string, updater: (l: MapLayer) => MapLayer): MapLayer[] => {
    return layers.map(layer => {
      if (layer.id === targetId) return updater(layer);
      if (layer.type === 'split' && layer.splitLayers) {
        return {
          ...layer,
          splitLayers: updateLayerRecursively(layer.splitLayers, targetId, updater)
        };
      }
      return layer;
    });
  };

  const toggleLayerVisibility = (id: string) => {
    setSettings(prev => {
      let newVisibility = false;
      const checkLayer = (layers: MapLayer[]) => {
        for (const l of layers) {
          if (l.id === id) {
            newVisibility = !l.visible;
          }
          if (l.splitLayers) checkLayer(l.splitLayers);
        }
      };
      checkLayer(prev.layers);

      return {
        ...prev,
        layers: updateLayerRecursively(prev.layers, id, l => {
          if (l.type === 'split' && l.splitLayers) {
            return {
              ...l,
              visible: newVisibility,
              splitLayers: l.splitLayers.map(sl => ({ ...sl, visible: newVisibility }))
            };
          }
          return { ...l, visible: newVisibility };
        })
      };
    });
  };

  const removeLayer = (id: string) => {
    setSettings(prev => ({
      ...prev,
      layers: prev.layers.filter(l => l.id !== id)
    }));
  };

  const renameLayer = (id: string, newName: string) => {
    setSettings(prev => ({
      ...prev,
      layers: updateLayerRecursively(prev.layers, id, l => ({ ...l, name: newName }))
    }));
  };

  const duplicateLayer = (id: string) => {
    setSettings(prev => {
      let layerToDuplicate: MapLayer | undefined;
      let parentSplitId: string | undefined;

      const findLayer = (layers: MapLayer[], parentId?: string) => {
        for (const l of layers) {
          if (l.id === id) {
            layerToDuplicate = l;
            parentSplitId = parentId;
          } else if (l.type === 'split' && l.splitLayers) {
            findLayer(l.splitLayers, l.id);
          }
        }
      };
      findLayer(prev.layers);

      if (!layerToDuplicate) return prev;

      const newLayer: MapLayer = {
        ...layerToDuplicate,
        id: `${layerToDuplicate.type}-${Date.now()}`,
        name: `${layerToDuplicate.name} (Copy)`,
        _isDirty: true
      };

      if (parentSplitId) {
        const splitContainer = prev.layers.find(l => l.id === parentSplitId);
        if (splitContainer && splitContainer.splitLayers && splitContainer.splitLayers.length < 2) {
          return {
            ...prev,
            layers: prev.layers.map(l => {
              if (l.id === parentSplitId) {
                return {
                  ...l,
                  splitLayers: [...(l.splitLayers || []), newLayer]
                };
              }
              return l;
            })
          };
        }
      }

      // Add to top of stack
      return { ...prev, layers: [newLayer, ...prev.layers] };
    });
  };

  const flatLayers = React.useMemo(() => {
    return settings.layers;
  }, [settings.layers]);

  const handleReorder = (newLayers: MapLayer[]) => {
    setSettings(prev => ({ ...prev, layers: newLayers }));
  };

  const handleDragEnd = (e: MouseEvent | TouchEvent | PointerEvent, layerId: string) => {
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      clientX = (e as TouchEvent).changedTouches[0].clientX;
      clientY = (e as TouchEvent).changedTouches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    const elements = document.elementsFromPoint(clientX, clientY);
    const dropZone = elements.find(el => 
      el.hasAttribute('data-drop-zone') && 
      el.getAttribute('data-layer-id') !== layerId
    );

    if (dropZone) {
      const zoneId = dropZone.getAttribute('data-drop-zone');
      setSettings(prev => {
        let isCurrentlyNested = false;
        let layerToMove: MapLayer | null = null;
        
        for (const l of prev.layers) {
          if (l.id === layerId) layerToMove = l;
          if (l.type === 'split' && l.splitLayers) {
            for (const sl of l.splitLayers) {
              if (sl.id === layerId) {
                layerToMove = sl;
                isCurrentlyNested = true;
              }
            }
          }
        }
        
        if (!layerToMove || layerToMove.type === 'split') return prev;

        if (zoneId === 'split-container' && !isCurrentlyNested) {
          const splitContainer = prev.layers.find(l => l.type === 'split');
          if (splitContainer && (!splitContainer.splitLayers || splitContainer.splitLayers.length < 2)) {
            const currentSplitLayers = splitContainer.splitLayers || [];
            const newLayers = prev.layers.filter(l => l.id !== layerId);
            const newSplit = { ...splitContainer, splitLayers: [...currentSplitLayers, layerToMove] };
            return {
              ...prev,
              layers: newLayers.map(l => l.id === splitContainer.id ? newSplit : l)
            };
          }
        } else if (zoneId === 'root' && isCurrentlyNested) {
          const splitContainer = prev.layers.find(l => l.type === 'split');
          if (splitContainer && splitContainer.splitLayers) {
            const newSplitLayers = splitContainer.splitLayers.filter(sl => sl.id !== layerId);
            const newSplit = { ...splitContainer, splitLayers: newSplitLayers };
            
            const splitIndex = prev.layers.findIndex(l => l.id === splitContainer.id);
            const newLayers = [...prev.layers];
            newLayers[splitIndex] = newSplit;
            newLayers.splice(splitIndex + 1, 0, layerToMove);
            
            return { ...prev, layers: newLayers };
          }
        }
        
        return prev;
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const geojson = await parseMapFileWithIds(file);
      const newLayer: MapLayer = {
        id: `upload-${Date.now()}`,
        name: file.name,
        type: 'geojson',
        visible: true,
        data: geojson,
        _isDirty: true
      };
      setSettings(prev => ({ ...prev, layers: [newLayer, ...prev.layers] }));
    } catch (err) {
      await customAlert(t('Error parsing file: ') + (err as Error).message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddUrl = () => {
    let inputUrl = urlInput.trim();
    if (!inputUrl) return;

    if (!inputUrl.startsWith('http')) {
      inputUrl = 'https://' + inputUrl;
    }

    try {
      if (inputUrl.toLowerCase().includes('wms')) {
        const urlObj = new URL(inputUrl);
        urlObj.searchParams.set('bbox', '{bbox-epsg-3857}');
        if (!urlObj.searchParams.has('width')) urlObj.searchParams.set('width', '256');
        if (!urlObj.searchParams.has('height')) urlObj.searchParams.set('height', '256');
        if (!urlObj.searchParams.has('srs') && !urlObj.searchParams.has('crs')) {
          urlObj.searchParams.set('srs', 'EPSG:3857');
          urlObj.searchParams.set('crs', 'EPSG:3857');
        }
        if (!urlObj.searchParams.has('transparent')) urlObj.searchParams.set('transparent', 'true');
        if (!urlObj.searchParams.has('format')) urlObj.searchParams.set('format', 'image/png');
        if (!urlObj.searchParams.has('styles')) urlObj.searchParams.set('styles', '');
        
        // Ensure mandatory WMS parameters are present
        if (!urlObj.searchParams.has('version') && !urlObj.searchParams.has('VERSION')) {
          urlObj.searchParams.set('version', '1.1.1');
        }
        if (!urlObj.searchParams.has('request') && !urlObj.searchParams.has('REQUEST')) {
          urlObj.searchParams.set('request', 'GetMap');
        }
        if (!urlObj.searchParams.has('service') && !urlObj.searchParams.has('SERVICE')) {
          urlObj.searchParams.set('service', 'WMS');
        }
        
        if (inputUrl.toLowerCase().includes('copernicus.eu')) {
          urlObj.searchParams.set('time', '{date-start}/{date-end}');
        }
        
        inputUrl = urlObj.toString().replace(/%7B/g, '{').replace(/%7D/g, '}');
      }
    } catch (e) {
      // Ignore parsing errors and proceed
    }

    const newLayer: MapLayer = {
      id: `url-${Date.now()}`,
      name: inputUrl.toLowerCase().includes('wms') ? 'Custom WMS' : 'Custom WMTS/XYZ',
      type: 'raster',
      visible: true,
      url: inputUrl,
      _isDirty: true
    };
    setSettings(prev => ({ ...prev, layers: [newLayer, ...prev.layers] }));
    setUrlInput('');
    setShowUrlInput(false);
  };

  return (
    <div
      className={`absolute top-0 left-0 h-full w-80 bg-zinc-900 border-r border-white/10 flex flex-col shadow-2xl z-40 text-white transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="p-4 flex justify-between items-center bg-black/20">
        <h2 className="font-semibold flex items-center gap-2 text-sm"><Layers size={18} /> {t('Map Settings')}</h2>
        <button onClick={onSaveAndExit || (() => setIsOpen(false))} className="text-white/50 hover:text-white transition-colors" title={onSaveAndExit ? t("Save & Exit to Overview") : t("Close")}>
          <X size={18} />
        </button>
      </div>

      <div className="p-3">
        <div className="flex border border-white/20 rounded-full p-1 relative bg-transparent text-xs font-semibold tracking-wider">
          <button
            onClick={() => setActiveTab('layers')}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === 'layers' ? 'text-black' : 'text-white/50 hover:text-white/80'}`}
            title={t("Layers")}
          >
            {activeTab === 'layers' && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-white rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Layers size={18} />
          </button>
          <button
            onClick={() => setActiveTab('icons')}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === 'icons' ? 'text-black' : 'text-white/50 hover:text-white/80'}`}
            title={t("Icon Library")}
          >
            {activeTab === 'icons' && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-white rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <ImageIcon size={18} />
          </button>
          <button
            onClick={() => setActiveTab('basemap')}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === 'basemap' ? 'text-black' : 'text-white/50 hover:text-white/80'}`}
            title={t("Base Map & Settings")}
          >
            {activeTab === 'basemap' && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-white rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Settings size={18} />
          </button>
          <button
            onClick={() => setActiveTab('video')}
            className={`flex-1 py-2 flex items-center justify-center relative z-10 transition-colors ${activeTab === 'video' ? 'text-black' : 'text-white/50 hover:text-white/80'}`}
            title={t("Export Video")}
          >
            {activeTab === 'video' && (
              <motion.div
                layoutId="tab-active-bg"
                className="absolute inset-0 bg-white rounded-full -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Video size={18} />
          </button>
          {onSave && (
            <div className="w-[1px] bg-white/20 mx-1 my-1" />
          )}
          {onSave && (
            <button
              onClick={onSave}
              disabled={isSaving}
              className={`w-12 flex items-center justify-center transition-colors rounded-full shrink-0 ${isSaving ? 'text-white cursor-wait bg-white/5' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}
              title={t("Save Map & Settings")}
            >
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            </button>
          )}
        </div>
      </div>

      {activeTab === 'layers' ? (
        <>
          <div className="p-4 border-b border-white/10">
            <label className="text-xs text-white mb-2 block font-semibold tracking-wider">
              {t("LABEL DENSITY")} ({settings.labelDensity ?? 50}%)
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 w-8 text-right">0%</span>
              <div className="relative flex-1 flex flex-col justify-center h-8">
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
                  {[...Array(11)].map((_, i) => (
                    <div key={i} className="w-[1px] h-2.5 bg-white/30" />
                  ))}
                </div>
                <input
                  type="range"
                  min="0" max="100"
                  value={settings.labelDensity ?? 50}
                  onChange={e => setSettings(prev => ({ ...prev, labelDensity: Number(e.target.value) }))}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer relative z-10"
                />
              </div>
              <span className="text-xs text-white/50 w-8">100%</span>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative flex flex-col">
            <div data-drop-zone="root" className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2">
              <label className="text-xs text-white mb-1 block font-semibold tracking-wider">{t("LAYER STACK")}</label>
              <Reorder.Group axis="y" values={flatLayers} onReorder={handleReorder} className="flex flex-col gap-2">
              {flatLayers.map((layer) => {
                return (
                  <LayerItem
                    key={layer.id}
                    layer={layer}
                    isNestedChild={false}
                    isDraggingLayer={isDraggingLayer}
                    setIsDraggingLayer={setIsDraggingLayer}
                    handleDragEnd={handleDragEnd}
                    selectedAircraftId={selectedAircraftId}
                    selectedVesselMmsi={selectedVesselMmsi}
                  toggleVisibility={toggleLayerVisibility}
                  removeLayer={removeLayer}
                  renameLayer={renameLayer}
                  colorPalette={settings.colorPalette}
                  activeGeojsonLayerId={activeGeojsonLayerId}
                  setActiveGeojsonLayerId={setActiveGeojsonLayerId}
                  selectedFeatureId={selectedGeojsonFeatureId}
                  saveAsPreset={saveAsPreset}
                  updateLayerStyle={(layerId, featureId, styleChanges) => {
                    setSettings(prev => ({
                      ...prev,
                      layers: updateLayerRecursively(prev.layers, layerId, l => {
                        if (!l.data || !l.data.features) return l;
                        const newData = {
                          ...l.data, features: l.data.features.map((f: any) => {
                            if (featureId === null || f.properties?.id === featureId) {
                              return { ...f, properties: { ...f.properties, ...styleChanges } };
                            }
                            return f;
                          })
                        };
                        return { ...l, data: newData, _isDirty: true };
                      })
                    }));
                  }}
                  updateLayerProperty={(layerId, property, value) => {
                    setSettings(prev => ({
                      ...prev,
                      layers: updateLayerRecursively(prev.layers, layerId, l => ({ ...l, [property]: value, _isDirty: true }))
                    }));
                  }}
                  updateLayerDates={(layerId, startDate, endDate) => {
                    setSettings(prev => ({
                      ...prev,
                      layers: updateLayerRecursively(prev.layers, layerId, l => {
                        const newName = l.type === 'deepstate' && (l.name === 'DeepStateMap Overlay' || l.name === 'DeepStateMap' || l.name.startsWith('DSM ') || l.name.startsWith('UKRAINE '))
                           ? `UKRAINE ${(startDate || new Date().toISOString().split('T')[0]).split('-').reverse().join('.')}`
                           : l.name;
                        return { ...l, startDate, endDate, name: newName, isLive: false, _isDirty: true };
                      })
                    }));
                  }}
                  toggleLive={(layerId) => {
                    setSettings(prev => ({
                      ...prev,
                      layers: updateLayerRecursively(prev.layers, layerId, l => {
                        if (l.type !== 'deepstate') return l;
                        const isCurrentlyLive = !!l.isLive;
                        const newName = !isCurrentlyLive 
                          ? 'UKRAINE CURRENT'
                          : `UKRAINE ${(l.startDate || new Date().toISOString().split('T')[0]).split('-').reverse().join('.')}`;
                        return { ...l, isLive: !isCurrentlyLive, name: newName, _isDirty: true };
                      })
                    }));
                  }}
                  duplicateLayer={duplicateLayer}
                />
              )})}
              </Reorder.Group>
            </div>

            <AnimatePresence>
              {showPresetLayers && (
                <motion.div
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  className="absolute inset-0 bg-zinc-900 z-20 flex flex-col p-4 custom-scrollbar overflow-y-auto"
                >
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
                    <label className="text-xs text-white font-semibold tracking-wider flex items-center gap-2">
                      <Layers size={14} /> {t("PRESET LAYERS")}
                    </label>
                    <button onClick={() => setShowPresetLayers(false)} className="text-white/50 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full p-1.5">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {[...DEFAULT_LAYERS, ...(settings.presetLayers || [])].map(layer => {
                      const isEnabled = settings.layers.some(l => l.id === layer.id);
                      return (
                        <div key={layer.id} className="flex items-center justify-between px-2 py-2">
                          <span className="text-sm font-medium text-white">{t(layer.name)}</span>
                          <button
                            onClick={() => toggleDefaultLayer(layer)}
                            className={`w-9 h-5 rounded-full relative transition-colors ${isEnabled ? 'bg-white' : 'bg-white/20'}`}
                          >
                            <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${isEnabled ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3 relative z-30">
            <button
              onClick={() => setShowPresetLayers(true)}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
            >
              <Layers size={16} /> {t("Preset layers")}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
            >
              <Upload size={16} /> {t("Upload GeoJSON/KML/KMZ")}
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json,.geojson,.kml,.kmz" className="hidden" />

            {showUrlInput ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder={t("WMTS/WMS URL...")}
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/30"
                />
                <div className="flex gap-2">
                  <button onClick={handleAddUrl} className="flex-1 py-1 bg-white text-black text-sm font-semibold hover:bg-white/90 rounded-full">{t("Add")}</button>
                  <button onClick={() => setShowUrlInput(false)} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-sm rounded-full">{t("Cancel")}</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowUrlInput(true)}
                className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
              >
                <Link size={16} /> {t("Add WMTS/WMS URL")}
              </button>
            )}
          </div>
        </>
      ) : activeTab === 'icons' ? (
        <>
          <div className="p-4 pb-2 border-b border-white/20">
            <div className="text-xs font-semibold tracking-wider text-white">{t("ICON SETS")}</div>
          </div>
          
          <div className="p-4 flex flex-col flex-1 overflow-y-auto custom-scrollbar">
            <Reorder.Group axis="y" values={settings.icons || []} onReorder={(newCategories) => setSettings(prev => ({ ...prev, icons: newCategories }))} className="flex flex-col gap-4">
              {settings.icons?.map((category, catIndex) => (
                <CategoryItem
                  key={category.id}
                  category={category}
                  catIndex={catIndex}
                  expandedCategories={expandedCategories}
                  setExpandedCategories={setExpandedCategories}
                  setSettings={setSettings}
                />
              ))}
            </Reorder.Group>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3">
            <button 
              onClick={() => {
                setSettings(prev => ({
                  ...prev,
                  icons: [
                    ...(prev.icons || []),
                    { id: `cat-${Date.now()}`, name: t('New Icon Set'), icons: [] }
                  ]
                }));
              }}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
            >
              + {t("New Icon Set")}
            </button>

            <label className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors cursor-pointer rounded-full">
              <Upload size={16} /> {t("Upload Icon Set")}
            <input 
              type="file" 
              accept=".svg" 
              multiple 
              className="hidden" 
              onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                
                const catName = await customPrompt(t(`Enter a name for the new category containing {{count}} icons:`, { count: files.length }), t('New Category'));
                if (!catName) {
                  e.target.value = '';
                  return;
                }

                const newIcons: { id: string; svg: string }[] = [];
                for (let i = 0; i < files.length; i++) {
                  const file = files[i];
                  const text = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => resolve(event.target?.result as string);
                    reader.readAsText(file);
                  });
                  if (text.includes('<svg')) {
                    newIcons.push({ id: `icon-${Date.now()}-${i}`, svg: text });
                  }
                }

                if (newIcons.length > 0) {
                  setSettings(prev => ({
                    ...prev,
                    icons: [
                      ...(prev.icons || []),
                      { id: `cat-${Date.now()}`, name: catName, icons: newIcons }
                    ]
                  }));
                }
                e.target.value = '';
              }}
            />
          </label>
          </div>
        </>
      ) : activeTab === 'video' ? (
        <>
          <div className="p-4 pb-2 border-b border-white/20">
            <div className="text-xs font-semibold tracking-wider text-white">{t("VIDEO EXPORT")}</div>
          </div>
          
          <div className="p-4 flex flex-col flex-1 overflow-y-auto custom-scrollbar gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/60 mb-2 block font-semibold tracking-wider">{t("FORMAT")}</label>
                <div className="flex border border-white/20 rounded-full p-1 relative bg-transparent">
                  {(['16x9', '9x16', 'both'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setVideoFormat(fmt)}
                      className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${
                        videoFormat === fmt ? 'text-black' : 'text-white/60 hover:text-white/80'
                      }`}
                    >
                      {videoFormat === fmt && (
                        <motion.div
                          layoutId="format-active-bg"
                          className="absolute inset-0 bg-white rounded-full -z-10"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      {t(fmt.charAt(0).toUpperCase() + fmt.slice(1))}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="text-xs text-white/60 mb-2 flex justify-between font-semibold tracking-wider">
                  <span>{t("STEP DURATION")}</span>
                  <span>{videoDuration}s</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(parseInt(e.target.value))}
                  className="w-full accent-white"
                />
              </div>

              <div>
                <label className="text-xs text-white/60 mb-2 flex justify-between font-semibold tracking-wider">
                  <span>{t("VIDEO BITRATE")}</span>
                  <span>{videoBitrate} Mbps</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={videoBitrate}
                  onChange={(e) => setVideoBitrate(parseInt(e.target.value))}
                  className="w-full accent-white"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs text-white/60 font-semibold tracking-wider cursor-pointer select-none" onClick={() => setDynamicLabels(!dynamicLabels)}>
                  {t("DYNAMIC LABELS")}
                </label>
                <button
                  onClick={() => setDynamicLabels(!dynamicLabels)}
                  className={`w-9 h-5 rounded-full relative transition-colors ${dynamicLabels ? 'bg-white' : 'bg-white/20'}`}
                >
                  <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${dynamicLabels ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                </button>
              </div>

            </div>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3">
            {!(annotations?.some(a => (a.type === 'label' || a.type === 'highlight') && a.text && a.view)) && (
              <div className="text-xs text-red-400/80 text-center px-2 py-1 leading-relaxed bg-red-500/10 rounded">
                {t("Video export requires custom map views to be set. Please use the highlight or label tools or manually add map views with the camera button.")}
              </div>
            )}
            <button
              disabled={!(annotations?.some(a => (a.type === 'label' || a.type === 'highlight') && a.text && a.view))}
              onClick={() => {
                const event = new CustomEvent('startVideoExport', { detail: { format: videoFormat, duration: videoDuration, dynamicLabels, bitrate: videoBitrate, showName: settings.title || currentShow } });
                window.dispatchEvent(event);
                setIsOpen(false);
              }}
              className={`w-full py-2 flex items-center justify-center gap-2 text-sm transition-colors ${
                (annotations?.some(a => (a.type === 'label' || a.type === 'highlight') && a.text && a.view)) 
                  ? 'bg-white/5 hover:bg-white/10' 
                  : 'bg-white/5 text-white/30 cursor-not-allowed'
              } rounded-full`}
            >
              <Video size={16} /> {t("Export Video")}
            </button>
          </div>
        </>
      ) : (
        <div className="p-4 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">



          {/* 1. COLOR PALETTE */}
          <div>
            <label className="text-xs text-white mb-2 block font-semibold tracking-wider">{t("COLOR PALETTE")}</label>
            <div className="flex flex-wrap gap-2 items-center">
              {settings.colorPalette.map((c, index) => (
                <div 
                  key={c} 
                  className="w-8 h-8 border border-white/20 relative group cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragEnd={handleColorDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div className="w-full h-full" style={{ backgroundColor: c }} />
                  <button 
                    onClick={() => removeColor(c)}
                    className="absolute inset-0 bg-black/60 text-white hidden group-hover:flex items-center justify-center text-xs font-bold transition-opacity"
                    title={t("Remove color")}
                  >
                    ×
                  </button>
                </div>
              ))}
              {!addingColor ? (
                <button 
                  onClick={() => setAddingColor(true)}
                  className="w-8 h-8 border border-white/20 flex items-center justify-center hover:bg-white hover:text-black transition-colors shrink-0"
                  title={t("Add color")}
                >
                  +
                </button>
              ) : (
                <div className="flex gap-1 items-center shrink-0 bg-white/5 border border-white/20 p-1">
                  <input 
                    type="color"
                    className="w-8 h-8 p-0 border-0 cursor-pointer bg-transparent"
                    value={newColorHex}
                    onChange={e => setNewColorHex(e.target.value.toUpperCase())}
                    title={t("Choose a color")}
                  />
                  <input 
                    autoFocus
                    className="w-24 bg-transparent px-1 outline-none font-mono text-xs border border-transparent focus:border-white/50 transition-colors h-8 uppercase"
                    value={newColorHex}
                    onChange={e => setNewColorHex(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmAddColor();
                      if (e.key === 'Escape') setAddingColor(false);
                    }}
                  />
                  <button onClick={confirmAddColor} className="text-white hover:bg-white hover:text-black px-3 font-semibold border border-white/20 text-xs h-8 rounded-full">{t("OK")}</button>
                </div>
              )}
            </div>
          </div>
          
          <div className="border-b border-white/20 -mx-4" />

          {/* 5. BASE MAP */}
          <details className="group flex flex-col gap-[2px] w-full">
            <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
              <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
              <span>{t("BASE MAP")}</span>
            </summary>
            <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
              <div>
                <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">{t("MAPBOX TOKEN")}</label>
                <input
                  className="w-full bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                  value={settings.mapboxToken}
                  onChange={e => setSettings(prev => ({ ...prev, mapboxToken: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">{t("MAPBOX STYLE")}</label>
                <input
                  className="w-full bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                  value={settings.mapboxStyle}
                  onChange={e => setSettings(prev => ({ ...prev, mapboxStyle: e.target.value }))}
                />
              </div>
            </div>
          </details>

          {/* 6. ANIMATIONS */}
          <details className="group flex flex-col gap-[2px] w-full mb-6">
            <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
              <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
              <span>{t("ANIMATIONS")}</span>
            </summary>
            <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
              <div>
                <label className="text-[10px] text-white mb-2 block font-semibold tracking-wider">
                  {t("PATH & POLYGON REVEAL")} ({(settings.animationDuration ?? 2000) / 1000}s)
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/50 w-6 text-right">0s</span>
                  <div className="relative flex-1 flex flex-col justify-center h-8">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="w-[1px] h-2.5 bg-white/30" />
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0" max="5000" step="500"
                      value={settings.animationDuration ?? 2000}
                      onChange={e => setSettings(prev => ({ ...prev, animationDuration: Number(e.target.value) }))}
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer relative z-10"
                    />
                  </div>
                  <span className="text-xs text-white/50 w-6">5s</span>
                </div>
              </div>
              
              <div>
                <label className="text-[10px] text-white mb-2 block font-semibold tracking-wider">
                  {t("LABEL & ICON REVEAL")} ({(settings.labelAnimationDuration ?? 1000) / 1000}s)
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/50 w-6 text-right">0s</span>
                  <div className="relative flex-1 flex flex-col justify-center h-8">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-between px-2 pointer-events-none">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="w-[1px] h-2.5 bg-white/30" />
                      ))}
                    </div>
                    <input
                      type="range"
                      min="0" max="5000" step="500"
                      value={settings.labelAnimationDuration ?? 1000}
                      onChange={e => setSettings(prev => ({ ...prev, labelAnimationDuration: Number(e.target.value) }))}
                      className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer relative z-10"
                    />
                  </div>
                  <span className="text-xs text-white/50 w-6">5s</span>
                </div>
              </div>
            </div>
          </details>

          {/* 6. API SETTINGS */}
          <details className="group flex flex-col gap-[2px] w-full mb-6">
            <summary className="relative p-3 flex items-center gap-2 bg-black text-xs text-white font-semibold tracking-wider cursor-pointer list-none outline-none [&::-webkit-details-marker]:hidden">
              <ChevronRight size={14} className="text-white/50 group-hover:text-white transition-colors group-open:hidden shrink-0" />
              <ChevronDown size={14} className="text-white/50 group-hover:text-white transition-colors hidden group-open:block shrink-0" />
              <span>{t("API SETTINGS")}</span>
            </summary>
            <div className="p-3 flex flex-col gap-4 bg-black mt-[2px]">
              <div>
                <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">{t("OPENSKY CREDENTIALS")}</label>
                <p className="text-[10px] text-white/40 mb-2 leading-tight">{t("Optional. Leave blank for anonymous access (rate-limited).")}</p>
                <div className="flex gap-2">
                  <input
                    placeholder={t("Client ID")}
                    className="w-1/2 bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                    value={settings.openSkyCredentials?.clientId || ''}
                    onChange={e => setSettings(prev => ({ ...prev, openSkyCredentials: { ...prev.openSkyCredentials, clientId: e.target.value, clientSecret: prev.openSkyCredentials?.clientSecret || '' } }))}
                  />
                  <input
                    type="password"
                    placeholder={t("Client Secret")}
                    className="w-1/2 bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                    value={settings.openSkyCredentials?.clientSecret || ''}
                    onChange={e => setSettings(prev => ({ ...prev, openSkyCredentials: { ...prev.openSkyCredentials, clientId: prev.openSkyCredentials?.clientId || '', clientSecret: e.target.value } }))}
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">{t("AISSTREAM CREDENTIALS")}</label>
                <p className="text-[10px] text-white/40 mb-2 leading-tight">{t("Required for Maritime Traffic. Get a free API key at aisstream.io")}</p>
                <input
                  type="password"
                  placeholder={t("API Key")}
                  className="w-full bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                  value={settings.aisstreamCredentials?.apiKey || ''}
                  onChange={e => setSettings(prev => ({ ...prev, aisstreamCredentials: { apiKey: e.target.value } }))}
                />
              </div>
              <div className="mt-2">
                <label className="text-[10px] text-white mb-1 block font-semibold tracking-wider">{t("GOOGLE MAPS API KEY")}</label>
                <p className="text-[10px] text-white/40 mb-2 leading-tight">{t("Optional. Enables train mode routing via Google Maps Directions API.")}</p>
                <input
                  type="password"
                  placeholder={t("API Key")}
                  className="w-full bg-black/60 px-3 py-2 outline-none font-mono text-xs border border-white/10 focus:border-white/50 transition-colors"
                  value={settings.googleMapsToken || ''}
                  onChange={e => setSettings(prev => ({ ...prev, googleMapsToken: e.target.value }))}
                />
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function LayerItem(props: {
  layer: MapLayer;
  isNestedChild?: boolean;
  toggleVisibility: (id: string) => void;
  removeLayer: (id: string) => void;
  renameLayer: (id: string, newName: string) => void;
  colorPalette: string[];
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: (id: string | null) => void;
  selectedFeatureId: string | number | null;
  updateLayerStyle: (layerId: string, featureId: string | number | null, styleChanges: any) => void;
  updateLayerProperty: (layerId: string, property: keyof MapLayer, value: any) => void;
  updateLayerDates?: (layerId: string, startDate?: string, endDate?: string) => void;
  duplicateLayer?: (id: string) => void;
  saveAsPreset?: (layer: MapLayer) => void;
  toggleLive?: (layerId: string) => void;
  handleDragEnd?: (e: MouseEvent | TouchEvent | PointerEvent, layerId: string) => void;
  isDraggingLayer?: boolean;
  setIsDraggingLayer?: (isDragging: boolean) => void;
  selectedAircraftId?: string | null;
  selectedVesselMmsi?: string | null;
}) {
  const { t } = useTranslation();
  const { layer, isNestedChild = false, toggleVisibility, removeLayer, renameLayer, colorPalette, activeGeojsonLayerId, setActiveGeojsonLayerId, selectedFeatureId, updateLayerStyle, updateLayerProperty, updateLayerDates, duplicateLayer, saveAsPreset, toggleLive, handleDragEnd, isDraggingLayer, setIsDraggingLayer, selectedAircraftId, selectedVesselMmsi } = props;
  const isActiveEdit = activeGeojsonLayerId === layer.id;
  const setActiveEdit = () => {
    if (isActiveEdit) setActiveGeojsonLayerId(null);
    else setActiveGeojsonLayerId(layer.id);
  };
  const controls = useDragControls();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);

  let defaultStartDate = '';
  let defaultEndDate = '';
  if (layer.id === 'copernicus') {
    const today = new Date();
    defaultEndDate = today.toISOString().split('T')[0];
    const past7d = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    defaultStartDate = past7d.toISOString().split('T')[0];
  }

  const [editTarget, setEditTarget] = useState<'fill' | 'outline'>('fill');

  const handleDoubleClick = () => {
    if (['deepstate', 'satellite', 'copernicus'].includes(layer.id)) return;
    setIsEditing(true);
    setEditName(layer.name);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== layer.name) {
      renameLayer(layer.id, editName.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditName(layer.name);
    }
  };

  const handleColorClick = (color: string) => {
    if (editTarget === 'fill') {
      updateLayerStyle(layer.id, selectedFeatureId, { fillColor: color });
    } else {
      updateLayerStyle(layer.id, selectedFeatureId, { outlineColor: color });
    }
  };

  const handleOpacityChange = (opacity: number) => {
    if (editTarget === 'fill') {
      updateLayerStyle(layer.id, selectedFeatureId, { fillOpacity: opacity });
    } else {
      updateLayerStyle(layer.id, selectedFeatureId, { outlineOpacity: opacity });
    }
  };

  const handleWidthChange = (width: number) => {
    updateLayerStyle(layer.id, selectedFeatureId, { outlineWidth: width });
  };

  const feature = layer.data?.features?.find((f: any) => selectedFeatureId ? f.properties?.id === selectedFeatureId : true);
  const currentFillColor = feature?.properties?.fillColor || '#00A79D';
  const currentFillOpacity = feature?.properties?.fillOpacity ?? 0.5;
  const currentOutlineColor = feature?.properties?.outlineColor || 'transparent';
  const currentOutlineOpacity = feature?.properties?.outlineOpacity ?? 1.0;
  const currentOutlineWidth = feature?.properties?.outlineWidth ?? 0;

  const handleSwap = () => {
    updateLayerStyle(layer.id, selectedFeatureId, {
      fillColor: currentOutlineColor,
      fillOpacity: currentOutlineOpacity,
      outlineColor: currentFillColor,
      outlineOpacity: currentFillOpacity
    });
  };

  const handleReset = () => {
    updateLayerStyle(layer.id, selectedFeatureId, {
      fillColor: '#00A79D',
      fillOpacity: 0.5,
      outlineColor: 'transparent',
      outlineWidth: 0,
      outlineOpacity: 1.0
    });
  };

  const renderColorSwatch = (color: string) => {
    if (color === 'transparent') {
      return (
        <button
          key="transparent"
          onClick={() => handleColorClick('transparent')}
          className="w-6 h-6 relative overflow-hidden flex-shrink-0 transition-colors"
          title={t("Transparent")}
        >
          <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
            <div className="w-full h-0 border-t border-red-500 transform rotate-45"></div>
          </div>
        </button>
      );
    }
    return (
      <button
        key={color}
        onClick={() => handleColorClick(color)}
        className="w-6 h-6 flex-shrink-0 transition-colors"
        style={{ backgroundColor: color }}
        title={color}
      />
    );
  };

  const Wrapper: any = isNestedChild ? motion.div : Reorder.Item;
  const wrapperProps: any = isNestedChild ? {
    drag: true,
    dragControls: controls,
    dragListener: false,
    dragSnapToOrigin: true,
    style: { zIndex: 50 },
    onDragStart: () => setIsDraggingLayer?.(true),
    onDragEnd: (e: any) => {
      setIsDraggingLayer?.(false);
      // Wait to allow drop zone detection
      setTimeout(() => {
        if (handleDragEnd) handleDragEnd(e, layer.id);
      }, 0);
    }
  } : {
    value: layer,
    dragListener: false,
    dragControls: controls,
    onDragStart: () => setIsDraggingLayer?.(true),
    onDragEnd: (e: any) => {
      setIsDraggingLayer?.(false);
      if (handleDragEnd) handleDragEnd(e, layer.id);
    }
  };

  const iconColor = layer.visible ? 'text-white' : 'text-white/50 hover:text-white';
  const iconColorFaded = layer.visible ? 'text-white' : 'text-white/30 hover:text-white/70';

  return (
    <div className={`flex flex-col ${isActiveEdit ? 'gap-0' : 'gap-[2px]'}`}>
      <Wrapper
        {...wrapperProps}
        data-drop-zone={layer.type === 'split' || isNestedChild ? 'split-container' : 'root'}
        data-layer-id={layer.id}
        className="w-full relative"
      >
        <div className={`relative flex flex-col transition-all duration-300 w-full ${isDraggingLayer && layer.type === 'split' ? 'bg-white/5' : ''} rounded-full`}>
          <div className={`relative p-3 flex items-center gap-3 select-none group transition-opacity duration-200 ${isActiveEdit ? 'bg-black z-10' : (layer.visible ? 'bg-black' : 'bg-transparent')} ${!layer.visible ? 'opacity-40' : 'opacity-100'} ${isNestedChild ? 'ml-6' : ''}`}>
            <div
              className={`cursor-grab active:cursor-grabbing ${iconColorFaded}`}
              onPointerDown={(e) => controls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <GripVertical size={16} />
            </div>
            <div data-layer-id={layer.id} className="absolute inset-0 pointer-events-none" />

            <button
              onClick={() => toggleVisibility(layer.id)}
              className={`transition-colors flex-shrink-0 ${iconColor}`}
            >
              {layer.visible ? <Eye size={18} /> : <EyeOff size={18} />}
            </button>

            <div 
              className="flex-1 min-w-0" 
              onDoubleClick={handleDoubleClick}
            >
              {layer.type === 'split' ? (
                <div className="flex flex-col gap-2 w-full">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold truncate text-white">{t("Split View Container")}</div>
                      <div className="text-[10px] text-white/40 uppercase tracking-wider">{layer.splitLayers?.[0]?.name ? t(layer.splitLayers[0].name) : t('Empty')} | {layer.splitLayers?.[1]?.name ? t(layer.splitLayers[1].name) : t('Empty')}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={handleKeyDown}
                      className="w-full bg-black border border-white/20 text-sm font-medium px-1 outline-none text-white focus:border-white/50"
                    />
                  ) : (
                    <div className="text-sm font-medium truncate cursor-text" title={t(layer.name)}>
                      {t(layer.name)}
                    </div>
                  )}
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">{layer.type}</div>
                </>
              )}
            </div>

            {layer.type !== 'split' && (layer.type === 'geojson' || layer.type === 'raster' || layer.type === 'satellite' || layer.type === 'deepstate' || layer.type === 'flights' || layer.type === 'vessels' || layer.type === 'wind' || layer.type === 'weather_forecast') && (
              <button
                onClick={() => {
                  if (!layer.visible) toggleVisibility(layer.id);
                  setActiveEdit();
                }}
                className={`transition-colors ${isActiveEdit ? 'text-white' : iconColorFaded}`}
                title={`Toggle ${layer.type === 'geojson' ? 'GeoJSON' : layer.type === 'flights' ? 'Air Traffic' : layer.type === 'vessels' ? 'Maritime Traffic' : layer.type === 'wind' ? 'Wind' : layer.type === 'weather_forecast' ? 'Weather Forecast' : 'Layer'} Edit Mode`}
              >
                <Edit2 size={16} />
              </button>
            )}

            {layer.type !== 'split' && layer.id !== 'satellite' && layer.id !== 'deepstate' && layer.id !== 'copernicus' && layer.id !== 'flights' && layer.type !== 'vessels' && layer.type !== 'wind' && !isNestedChild && (
              <button onClick={() => removeLayer(layer.id)} className={`transition-colors ml-1 ${iconColor} rounded-full`}>
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {isActiveEdit && (
            <div className={`bg-black p-3 pt-2 flex flex-col gap-4 text-sm animate-in slide-in-from-top-2 relative z-0 transition-opacity duration-200 ${!layer.visible ? 'opacity-40' : 'opacity-100'} ${isNestedChild ? 'ml-6' : ''}`}>
          {layer.type === 'raster' || layer.type === 'satellite' || layer.type === 'deepstate' ? (
            <div className="flex flex-col gap-3 pb-2">
              <div className="flex items-center gap-3">
                {layer.type === 'raster' && saveAsPreset && (
                  <button onClick={() => saveAsPreset(layer)} className="text-white/50 hover:text-white transition-colors flex items-center shrink-0" title={t("Save as Preset")}>
                    <BookmarkPlus size={16} />
                  </button>
                )}
                {layer.type === 'deepstate' && duplicateLayer && (
                    <button onClick={() => duplicateLayer(layer.id)} className="text-white/50 hover:text-white transition-colors flex items-center shrink-0" title={t("Duplicate Layer")}>
                      <Copy size={16} />
                    </button>
                  )}
                  {layer.type === 'deepstate' && toggleLive && (
                    <button 
                      onClick={() => toggleLive(layer.id)} 
                      className={`transition-colors flex items-center shrink-0 ${layer.isLive ? 'text-[#ff0000] drop-shadow-[0_0_5px_rgba(255,0,0,0.8)]' : 'text-white/50 hover:text-white'}`} 
                      title={layer.isLive ? "LIVE Mode Active" : "Enable LIVE Mode"}
                    >
                      <Radio size={16} />
                    </button>
                  )}
                  {layer.type === 'deepstate' && updateLayerDates && (
                    <div className="flex-1 flex justify-end">
                      <input 
                        type="date" 
                        min="2024-07-08"
                        max={new Date().toISOString().split('T')[0]}
                        value={layer.startDate || new Date().toISOString().split('T')[0]} 
                        onChange={e => updateLayerDates(layer.id, e.target.value)}
                        className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50 w-full max-w-[140px]"
                        style={{ colorScheme: 'dark' }}
                        title="Fetch historical data from Github"
                      />
                    </div>
                  )}
              </div>
              
              {layer.id === 'copernicus' && updateLayerDates && (
                <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-white font-semibold tracking-wider">{t("START DATE")}</label>
                    <input 
                      type="date" 
                      value={layer.startDate || defaultStartDate} 
                      onChange={e => updateLayerDates(layer.id, e.target.value, layer.endDate || defaultEndDate)}
                      className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-white font-semibold tracking-wider">{t("END DATE")}</label>
                    <input 
                      type="date" 
                      value={layer.endDate || defaultEndDate} 
                      onChange={e => updateLayerDates(layer.id, layer.startDate || defaultStartDate, e.target.value)}
                      className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>
              )}

              <div className={`flex flex-col gap-1 mt-1 ${layer.type === 'deepstate' ? '' : 'pt-2 border-t border-white/10'}`}>
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white font-semibold tracking-wider">{t("OPACITY")}</label>
                  <span className="text-[10px] text-white/70 font-mono">{Math.round((layer.opacity ?? (layer.type === 'deepstate' ? 0.5 : 1.0)) * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="100"
                  value={(layer.opacity ?? (layer.type === 'deepstate' ? 0.5 : 1.0)) * 100}
                  onChange={e => updateLayerProperty(layer.id, 'opacity', Number(e.target.value) / 100)}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                />
              </div>

              {(layer.type === 'raster' || layer.type === 'satellite') && (
                <details className="mt-3 group">
                  <summary className="text-[10px] text-white font-semibold tracking-wider cursor-pointer select-none hover:text-white transition-colors flex items-center justify-between">
                    ADJUSTMENTS
                    <span className="group-open:rotate-180 transition-transform text-xs">▼</span>
                  </summary>
                  <div className="pt-3 pb-1 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-end">
                        <label className="text-[10px] text-white font-semibold tracking-wider">{t("BRIGHTNESS")}</label>
                        <span className="text-[10px] text-white/70 font-mono">{Math.round((layer.brightness ?? 0) * 100)}%</span>
                      </div>
                      <input
                        type="range" min="-100" max="100"
                        value={(layer.brightness ?? 0) * 100}
                        onChange={e => updateLayerProperty(layer.id, 'brightness', Number(e.target.value) / 100)}
                        onDoubleClick={() => updateLayerProperty(layer.id, 'brightness', 0)}
                        className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        title="Double-click to reset"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-end">
                        <label className="text-[10px] text-white font-semibold tracking-wider">{t("CONTRAST")}</label>
                        <span className="text-[10px] text-white/70 font-mono">{Math.round((layer.contrast ?? 0) * 100)}%</span>
                      </div>
                      <input
                        type="range" min="-100" max="100"
                        value={(layer.contrast ?? 0) * 100}
                        onChange={e => updateLayerProperty(layer.id, 'contrast', Number(e.target.value) / 100)}
                        onDoubleClick={() => updateLayerProperty(layer.id, 'contrast', 0)}
                        className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        title="Double-click to reset"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-end">
                        <label className="text-[10px] text-white font-semibold tracking-wider">{t("SATURATION")}</label>
                        <span className="text-[10px] text-white/70 font-mono">{Math.round((layer.saturation ?? 0) * 100)}%</span>
                      </div>
                      <input
                        type="range" min="-100" max="100"
                        value={(layer.saturation ?? 0) * 100}
                        onChange={e => updateLayerProperty(layer.id, 'saturation', Number(e.target.value) / 100)}
                        onDoubleClick={() => updateLayerProperty(layer.id, 'saturation', 0)}
                        className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        title="Double-click to reset"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-end">
                        <label className="text-[10px] text-white font-semibold tracking-wider">{t("HUE ROTATE")}</label>
                        <span className="text-[10px] text-white/70 font-mono">{layer.hue ?? 0}°</span>
                      </div>
                      <input
                        type="range" min="0" max="360"
                        value={layer.hue ?? 0}
                        onChange={e => updateLayerProperty(layer.id, 'hue', Number(e.target.value))}
                        onDoubleClick={() => updateLayerProperty(layer.id, 'hue', 0)}
                        className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                        title="Double-click to reset"
                      />
                    </div>
                  </div>
                </details>
              )}
            </div>
          ) : layer.type === 'flights' ? (
            <div className="flex flex-col gap-4 pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white font-semibold tracking-wider">TAIL LABELS</span>
                <button
                  onClick={() => updateLayerProperty(layer.id, 'showCallsigns', !layer.showCallsigns)}
                  className={`transition-colors ${layer.showCallsigns ? 'text-white' : 'text-white/50 hover:text-white'}`}
                  title={layer.showCallsigns ? "Hide Callsigns" : "Show Callsigns"}
                >
                  {layer.showCallsigns ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-white font-semibold tracking-wider">{t("SEARCH CALLSIGN / REGISTRATION")}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter callsign..."
                    className="w-full bg-black/50 border border-white/10 px-3 py-1.5 text-sm outline-none focus:border-white/30"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim().toUpperCase();
                        if (val) {
                          const event = new CustomEvent('searchAircraft', { detail: val });
                          window.dispatchEvent(event);
                        }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                  {selectedAircraftId ? `COLOR (AIRCRAFT ${selectedAircraftId})` : 'GLOBAL AIRCRAFT COLOR'}
                </label>
                <div className="flex flex-wrap gap-1">
                  {colorPalette.map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        if (selectedAircraftId) {
                          const existingColors = layer.aircraftColors || {};
                          updateLayerProperty(layer.id, 'aircraftColors', { ...existingColors, [String(selectedAircraftId)]: color });
                        } else {
                          updateLayerProperty(layer.id, 'globalAircraftColor', color);
                        }
                      }}
                      className="w-6 h-6 flex-shrink-0 transition-colors relative"
                      style={{ backgroundColor: color }}
                      title={color}
                    >
                      {((selectedAircraftId && layer.aircraftColors?.[String(selectedAircraftId)] === color) || 
                        (!selectedAircraftId && layer.globalAircraftColor === color)) && (
                        <div className="absolute inset-0 flex items-center justify-center mix-blend-difference text-white text-xs">✓</div>
                      )}
                    </button>
                  ))}
                  <button
                    key="transparent"
                    onClick={() => {
                      if (selectedAircraftId) {
                        const existingColors = { ...layer.aircraftColors };
                        delete existingColors[String(selectedAircraftId)];
                        updateLayerProperty(layer.id, 'aircraftColors', existingColors);
                      } else {
                        updateLayerProperty(layer.id, 'globalAircraftColor', undefined);
                      }
                    }}
                    className="w-6 h-6 relative overflow-hidden flex-shrink-0 transition-colors"
                    title={t("Reset to Default White")}
                  >
                    <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                      <div className="w-full h-0 border-t border-red-500 transform rotate-45"></div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1 mt-2 border-t border-white/10 pt-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white font-semibold tracking-wider">{t("FLIGHTPATH OPACITY")}</label>
                  <span className="text-[10px] text-white/70 font-mono">{Math.round((layer.flightpathOpacity ?? 0.8) * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="100"
                  value={(layer.flightpathOpacity ?? 0.8) * 100}
                  onChange={e => updateLayerProperty(layer.id, 'flightpathOpacity', Number(e.target.value) / 100)}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                />
              </div>
            </div>
          ) : layer.type === 'vessels' ? (
            <div className="flex flex-col gap-4 pb-2">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-white font-semibold tracking-wider uppercase">
                  {selectedVesselMmsi ? `COLOR (VESSEL MMSI: ${selectedVesselMmsi})` : 'GLOBAL VESSEL COLOR'}
                </label>
                <div className="flex flex-wrap gap-1">
                  {colorPalette.map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        if (selectedVesselMmsi) {
                          const existingColors = layer.vesselColors || {};
                          updateLayerProperty(layer.id, 'vesselColors', { ...existingColors, [String(selectedVesselMmsi)]: color });
                        } else {
                          updateLayerProperty(layer.id, 'globalVesselColor', color);
                        }
                      }}
                      className="w-6 h-6 flex-shrink-0 transition-colors relative"
                      style={{ backgroundColor: color }}
                      title={color}
                    >
                      {((selectedVesselMmsi && layer.vesselColors?.[String(selectedVesselMmsi)] === color) || 
                        (!selectedVesselMmsi && layer.globalVesselColor === color)) && (
                        <div className="absolute inset-0 flex items-center justify-center mix-blend-difference text-white text-xs">✓</div>
                      )}
                    </button>
                  ))}
                  <button
                    key="transparent"
                    onClick={() => {
                      if (selectedVesselMmsi) {
                        const existingColors = { ...layer.vesselColors };
                        delete existingColors[String(selectedVesselMmsi)];
                        updateLayerProperty(layer.id, 'vesselColors', existingColors);
                      } else {
                        updateLayerProperty(layer.id, 'globalVesselColor', undefined);
                      }
                    }}
                    className="w-6 h-6 relative overflow-hidden flex-shrink-0 transition-colors"
                    title={t("Reset to Default White")}
                  >
                    <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                      <div className="w-full h-0 border-t border-red-500 transform rotate-45"></div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          ) : layer.type === 'wind' ? (
            <div className="flex flex-col gap-4 pb-2">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('refreshWindLayer'))}
                className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors"
              >
                <RefreshCcw size={16} /> Refresh Wind
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateLayerProperty(layer.id, 'showWindParticles', layer.showWindParticles === false)}
                  className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-xs font-semibold tracking-wider uppercase text-left"
                >
                  Particles
                  <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.showWindParticles !== false ? 'bg-white' : 'bg-white/20'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.showWindParticles !== false ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                  </div>
                </button>
                <button
                  onClick={() => updateLayerProperty(layer.id, 'showWindArrows', layer.showWindArrows !== true)}
                  className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-xs font-semibold tracking-wider uppercase text-left"
                >
                  Arrows
                  <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.showWindArrows === true ? 'bg-white' : 'bg-white/20'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.showWindArrows === true ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                  </div>
                </button>
                <button
                  onClick={() => updateLayerProperty(layer.id, 'showWindLegend', layer.showWindLegend === false)}
                  className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-xs font-semibold tracking-wider uppercase text-left"
                >
                  Legend
                  <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.showWindLegend !== false ? 'bg-white' : 'bg-white/20'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.showWindLegend !== false ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                  </div>
                </button>
                <button
                  onClick={() => updateLayerProperty(layer.id, 'showWindTimeline', layer.showWindTimeline === false)}
                  className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-xs font-semibold tracking-wider uppercase text-left"
                >
                  Timeline
                  <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.showWindTimeline !== false ? 'bg-white' : 'bg-white/20'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.showWindTimeline !== false ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateLayerProperty(layer.id, 'windParticleSizeBySpeed', layer.windParticleSizeBySpeed !== true)}
                  className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                >
                  Size by speed
                  <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.windParticleSizeBySpeed === true ? 'bg-white' : 'bg-white/20'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.windParticleSizeBySpeed === true ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                  </div>
                </button>
                <button
                  onClick={() => updateLayerProperty(layer.id, 'windParticleSpeedBySpeed', layer.windParticleSpeedBySpeed === false)}
                  className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                >
                  Motion by speed
                  <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.windParticleSpeedBySpeed !== false ? 'bg-white' : 'bg-white/20'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.windParticleSpeedBySpeed !== false ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                  </div>
                </button>
                <button
                  onClick={() => updateLayerProperty(layer.id, 'windParticleTrailBySpeed', layer.windParticleTrailBySpeed !== true)}
                  className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                >
                  Trail by speed
                  <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.windParticleTrailBySpeed === true ? 'bg-white' : 'bg-white/20'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.windParticleTrailBySpeed === true ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                  </div>
                </button>
                <button
                  onClick={() => updateLayerProperty(layer.id, 'windParticleColorBySpeed', layer.windParticleColorBySpeed !== true)}
                  className="flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer text-[10px] font-semibold tracking-wider uppercase text-left"
                >
                  Color by speed
                  <div className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${layer.windParticleColorBySpeed === true ? 'bg-white' : 'bg-white/20'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-1 transition-all ${layer.windParticleColorBySpeed === true ? 'left-5 bg-black' : 'left-1 bg-white'}`} />
                  </div>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">{t("ARROW COLOR")}</label>
                <div className="flex flex-wrap gap-1">
                  {colorPalette.map(color => (
                    <button
                      key={color}
                      onClick={() => updateLayerProperty(layer.id, 'windColor', color)}
                      className="w-6 h-6 flex-shrink-0 transition-colors relative"
                      style={{ backgroundColor: color }}
                      title={color}
                    >
                      {layer.windColor === color && (
                        <div className="absolute inset-0 flex items-center justify-center mix-blend-difference text-white text-xs">✓</div>
                      )}
                    </button>
                  ))}
                  <button
                    key="transparent"
                    onClick={() => updateLayerProperty(layer.id, 'windColor', undefined)}
                    className="w-6 h-6 relative overflow-hidden flex-shrink-0 transition-colors"
                    title={t("Reset to Default White")}
                  >
                    <div className="absolute inset-0 bg-white/10 flex items-center justify-center">
                      <div className="w-full h-0 border-t border-red-500 transform rotate-45"></div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1 mt-2 border-t border-white/10 pt-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white/50 font-semibold tracking-wider">{t("WIND OPACITY")}</label>
                  <span className="text-[10px] text-white/70 font-mono">{Math.round((layer.windOpacity ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="100"
                  value={(layer.windOpacity ?? 1) * 100}
                  onChange={e => updateLayerProperty(layer.id, 'windOpacity', Number(e.target.value) / 100)}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white/50 font-semibold tracking-wider">{t("PARTICLE SIZE")}</label>
                  <span className="text-[10px] text-white/70 font-mono">{(layer.windParticleSize ?? 1.2).toFixed(1)}px</span>
                </div>
                <input
                  type="range" min="0.5" max="3" step="0.1"
                  value={layer.windParticleSize ?? 1.2}
                  onChange={e => updateLayerProperty(layer.id, 'windParticleSize', Number(e.target.value))}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white/50 font-semibold tracking-wider">{t("PARTICLE TRAIL")}</label>
                  <span className="text-[10px] text-white/70 font-mono">{Math.round(layer.windParticleTrail ?? 90)}%</span>
                </div>
                <input
                  type="range" min="0" max="100" step="1"
                  value={layer.windParticleTrail ?? 90}
                  onChange={e => updateLayerProperty(layer.id, 'windParticleTrail', Number(e.target.value))}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                />
              </div>
            </div>
          ) : layer.type === 'weather_forecast' ? (
            <div className="flex flex-col gap-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {duplicateLayer && (
                    <button onClick={() => duplicateLayer(layer.id)} className="text-white/50 hover:text-white transition-colors flex items-center shrink-0" title={t("Duplicate Layer")}>
                      <Copy size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">{t("OPACITY")}</label>
                  <span className="text-[10px] text-white/70 font-mono">{Math.round((layer.opacity ?? 0.75) * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="100" step="1"
                  value={Math.round((layer.opacity ?? 0.75) * 100)}
                  onChange={e => updateLayerProperty(layer.id, 'opacity', Number(e.target.value) / 100)}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                />
              </div>

              <div className="flex border border-white/20 rounded-full p-1 relative bg-transparent mt-2">
                <button
                  onClick={() => {
                    updateLayerProperty(layer.id, 'showTemperature', true);
                    updateLayerProperty(layer.id, 'showPrecipitation', false);
                  }}
                  className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${layer.showTemperature ? 'text-black' : 'text-white/60 hover:text-white/80'}`}
                >
                  {layer.showTemperature && (
                    <motion.div
                      layoutId={`weather-active-bg-${layer.id}`}
                      className="absolute inset-0 bg-white rounded-full -z-10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  {t("Temperature")}
                </button>
                <button
                  onClick={() => {
                    updateLayerProperty(layer.id, 'showTemperature', false);
                    updateLayerProperty(layer.id, 'showPrecipitation', true);
                  }}
                  className={`flex-1 px-4 py-2 text-sm relative z-10 transition-colors ${layer.showPrecipitation ? 'text-black' : 'text-white/60 hover:text-white/80'}`}
                >
                  {layer.showPrecipitation && (
                    <motion.div
                      layoutId={`weather-active-bg-${layer.id}`}
                      className="absolute inset-0 bg-white rounded-full -z-10"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  {t("Precipitation")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Swatches */}
              <div className="flex flex-wrap gap-1">
                {colorPalette.map(renderColorSwatch)}
                {renderColorSwatch('transparent')}
              </div>

              <div className="flex items-center justify-between">
                {/* Toggle fill / outline target & Swap */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditTarget('fill')}
                    className={`p-1 flex items-center justify-center transition-colors ${editTarget === 'fill' ? 'text-white' : 'text-white/50 hover:text-white'}`}
                    title={t("Edit Fill")}
                  >
                    <Square size={16} fill="currentColor" stroke="none" />
                  </button>
                  <button
                    onClick={() => setEditTarget('outline')}
                    className={`p-1 flex items-center justify-center transition-colors ${editTarget === 'outline' ? 'text-white' : 'text-white/50 hover:text-white'}`}
                    title={t("Edit Outline")}
                  >
                    <Square size={16} />
                  </button>
                  <button onClick={handleSwap} className="text-white/50 hover:text-white transition-colors p-1 rounded-full" title={t("Swap Fill and Outline")}>
                    <RefreshCcw size={16} />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {saveAsPreset && (
                    <button onClick={() => saveAsPreset(layer)} className="text-white/50 hover:text-white transition-colors p-1" title={t("Save as Preset")}>
                      <BookmarkPlus size={16} />
                    </button>
                  )}
                  {duplicateLayer && (
                    <button onClick={() => duplicateLayer(layer.id)} className="text-white/50 hover:text-white transition-colors p-1" title={t("Duplicate Layer")}>
                      <Copy size={16} />
                    </button>
                  )}
                  <button onClick={handleReset} className="text-white/50 hover:text-white transition-colors p-1 rounded-full" title={t("Reset Styles")}>
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>

              {/* Opacity slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white font-semibold tracking-wider">{t("OPACITY")}</label>
                  <span className="text-[10px] text-white/70 font-mono">{Math.round((editTarget === 'fill' ? currentFillOpacity : currentOutlineOpacity) * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="100"
                  value={(editTarget === 'fill' ? currentFillOpacity : currentOutlineOpacity) * 100}
                  onChange={e => handleOpacityChange(Number(e.target.value) / 100)}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                />
              </div>

              {/* Outline width slider */}
              <div className="flex flex-col gap-1 pb-2">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white font-semibold tracking-wider">{t("STROKE WIDTH")}</label>
                  <span className="text-[10px] text-white/70 font-mono">{currentOutlineWidth}px</span>
                </div>
                <input
                  type="range" min="0" max="20"
                  value={currentOutlineWidth}
                  onChange={e => handleWidthChange(Number(e.target.value))}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                />
              </div>
            </>
          )}
        </div>
          )}
          
          {layer.type === 'split' && (
            <div className="flex flex-col w-full">
              {layer.splitLayers?.map(child => (
                <LayerItem key={child.id} {...props} layer={child} isNestedChild={true} />
              ))}
              {Array.from({ length: 2 - (layer.splitLayers?.length || 0) }).map((_, i) => (
                <div key={`empty-${i}`} data-drop-zone="split-container" data-layer-id={layer.id} className={`ml-6 transition-all duration-300 ${isDraggingLayer ? 'h-12 mt-[2px]' : 'h-0 overflow-hidden'}`}>
                  <div className={`relative h-full flex items-center justify-center select-none transition-colors duration-200 border-2 border-dashed ${isDraggingLayer ? 'border-white bg-white/5' : 'border-transparent bg-transparent'} rounded-full`}>
                    <span className="text-xs text-white/40 font-semibold tracking-wider uppercase">DROP LAYER HERE</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Wrapper>
    </div>
  );
}
