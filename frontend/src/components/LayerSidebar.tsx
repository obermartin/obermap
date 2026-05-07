import React, { useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, Eye, EyeOff, Upload, Link, X, Layers, Trash2, Edit2, Square, RefreshCcw, RotateCcw } from 'lucide-react';
import type { AppSettings, MapLayer } from '../types';
import { parseMapFileWithIds } from '../utils/fileUtils';

interface LayerSidebarProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedGeojsonFeatureId: string | number | null;
}

export function LayerSidebar({
  settings,
  setSettings,
  isOpen,
  setIsOpen,
  activeGeojsonLayerId,
  setActiveGeojsonLayerId,
  selectedGeojsonFeatureId
}: LayerSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [activeTab, setActiveTab] = useState<'layers' | 'basemap'>('layers');

  const handleCaptureView = () => {
    const event = new CustomEvent('requestViewCapture');
    window.dispatchEvent(event);
  };

  const handleReorder = (newOrder: MapLayer[]) => {
    setSettings(prev => ({ ...prev, layers: newOrder }));
  };

  const updateLayerRecursively = (layers: MapLayer[], targetId: string, updater: (l: MapLayer) => MapLayer): MapLayer[] => {
    return layers.map(layer => {
      if (layer.id === targetId) return updater(layer);
      if (layer.type === 'split' && layer.splitLayers) {
        return {
          ...layer,
          splitLayers: updateLayerRecursively(layer.splitLayers, targetId, updater) as [MapLayer, MapLayer]
        };
      }
      return layer;
    });
  };

  const toggleLayerVisibility = (id: string) => {
    setSettings(prev => ({
      ...prev,
      layers: updateLayerRecursively(prev.layers, id, l => ({ ...l, visible: !l.visible }))
    }));
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

  const createSplit = (draggedId: string, targetId: string) => {
    setSettings(prev => {
      const draggedLayer = prev.layers.find(l => l.id === draggedId);
      const targetLayer = prev.layers.find(l => l.id === targetId);
      if (!draggedLayer || !targetLayer || draggedLayer.type === 'split' || targetLayer.type === 'split') return prev;

      const newLayers = prev.layers.filter(l => l.id !== draggedId && l.id !== targetId);
      const splitLayer: MapLayer = {
        id: `split-${Date.now()}`,
        name: `Split View`,
        type: 'split',
        visible: true,
        splitLayers: [targetLayer, draggedLayer],
        splitDirection: 'vertical',
        splitPosition: 0.5,
        _isDirty: true
      };
      
      const targetIndex = prev.layers.findIndex(l => l.id === targetId);
      newLayers.splice(targetIndex >= 0 ? targetIndex : 0, 0, splitLayer);
      return { ...prev, layers: newLayers };
    });
  };

  const removeSplit = (id: string) => {
    setSettings(prev => {
      const splitLayer = prev.layers.find(l => l.id === id);
      if (!splitLayer || splitLayer.type !== 'split' || !splitLayer.splitLayers) return prev;
      
      const newLayers = prev.layers.filter(l => l.id !== id);
      const targetIndex = prev.layers.findIndex(l => l.id === id);
      newLayers.splice(targetIndex >= 0 ? targetIndex : 0, 0, ...splitLayer.splitLayers);
      return { ...prev, layers: newLayers };
    });
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
      alert('Error parsing file: ' + (err as Error).message);
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
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
        <h2 className="font-semibold flex items-center gap-2 text-sm"><Layers size={18} /> Map Settings</h2>
        <button onClick={() => setIsOpen(false)} className="hover:text-red-400 transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="flex border-b border-white/10 text-xs font-semibold tracking-wider">
        <button
          onClick={() => setActiveTab('layers')}
          className={`flex-1 py-3 text-center transition-colors ${activeTab === 'layers' ? 'bg-white text-black' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
        >
          LAYERS
        </button>
        <button
          onClick={() => setActiveTab('basemap')}
          className={`flex-1 py-3 text-center transition-colors ${activeTab === 'basemap' ? 'bg-white text-black' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
        >
          BASE MAP
        </button>
      </div>

      {activeTab === 'layers' ? (
        <>
          <div className="p-4 border-b border-white/10">
            <label className="text-xs text-white/50 mb-2 block font-semibold tracking-wider">LABEL DENSITY</label>
            <div className="flex items-center gap-3">
              <span className="text-xs">0%</span>
              <input
                type="range"
                min="0" max="100"
                value={settings.labelDensity ?? 50}
                onChange={e => setSettings(prev => ({ ...prev, labelDensity: Number(e.target.value) }))}
                className="flex-1 accent-white h-1 bg-white/20 appearance-none cursor-pointer"
              />
              <span className="text-xs">100%</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-2">
            <label className="text-xs text-white/50 mb-1 block font-semibold tracking-wider">LAYER STACK</label>
            <Reorder.Group axis="y" values={settings.layers} onReorder={handleReorder} className="flex flex-col gap-2">
              {settings.layers.map(layer => (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  createSplit={createSplit}
                  removeSplit={removeSplit}
                  toggleVisibility={toggleLayerVisibility}
                  removeLayer={removeLayer}
                  renameLayer={renameLayer}
                  colorPalette={settings.colorPalette}
                  activeGeojsonLayerId={activeGeojsonLayerId}
                  setActiveGeojsonLayerId={setActiveGeojsonLayerId}
                  selectedFeatureId={selectedGeojsonFeatureId}
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
                  updateLayerOpacity={(layerId, opacity) => {
                    setSettings(prev => ({
                      ...prev,
                      layers: updateLayerRecursively(prev.layers, layerId, l => ({ ...l, opacity, _isDirty: true }))
                    }));
                  }}
                  updateLayerDates={(layerId, startDate, endDate) => {
                    setSettings(prev => ({
                      ...prev,
                      layers: updateLayerRecursively(prev.layers, layerId, l => ({ ...l, startDate, endDate, _isDirty: true }))
                    }));
                  }}
                />
              ))}
            </Reorder.Group>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors"
            >
              <Upload size={16} /> Upload GeoJSON/KML/KMZ
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json,.geojson,.kml,.kmz" className="hidden" />

            {showUrlInput ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="WMTS/WMS URL..."
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 px-3 py-2 text-sm outline-none focus:border-white/30"
                />
                <div className="flex gap-2">
                  <button onClick={handleAddUrl} className="flex-1 py-1 bg-white text-black text-sm font-semibold hover:bg-white/90">Add</button>
                  <button onClick={() => setShowUrlInput(false)} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowUrlInput(true)}
                className="w-full py-2 bg-white/5 hover:bg-white/10 flex items-center justify-center gap-2 text-sm transition-colors"
              >
                <Link size={16} /> Add WMTS/WMS URL
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="p-4 flex flex-col gap-6 flex-1 overflow-y-auto custom-scrollbar">
          <div>
            <label className="text-xs text-white/50 mb-2 block font-semibold tracking-wider">MAPBOX TOKEN</label>
            <input
              className="w-full bg-black/40 px-3 py-2 outline-none font-mono text-sm border border-white/10 focus:border-white/50 transition-colors"
              value={settings.mapboxToken}
              onChange={e => setSettings(prev => ({ ...prev, mapboxToken: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-2 block font-semibold tracking-wider">MAPBOX STYLE</label>
            <input
              className="w-full bg-black/40 px-3 py-2 outline-none font-mono text-sm border border-white/10 focus:border-white/50 transition-colors"
              value={settings.mapboxStyle}
              onChange={e => setSettings(prev => ({ ...prev, mapboxStyle: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-2 block font-semibold tracking-wider">DEFAULT VIEW</label>
            <p className="text-xs text-white/40 mb-3">Save the current map position and zoom level as the default view when loading the application.</p>
            <button
              onClick={handleCaptureView}
              className="w-full py-2 bg-white/10 hover:bg-white hover:text-black flex items-center justify-center gap-2 text-sm transition-colors font-semibold tracking-wider"
            >
              CAPTURE CURRENT VIEW
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LayerItem({ layer, isNested, createSplit, removeSplit, toggleVisibility, removeLayer, renameLayer, colorPalette, activeGeojsonLayerId, setActiveGeojsonLayerId, selectedFeatureId, updateLayerStyle, updateLayerOpacity, updateLayerDates }: {
  layer: MapLayer;
  isNested?: boolean;
  createSplit?: (draggedId: string, targetId: string) => void;
  removeSplit?: (id: string) => void;
  toggleVisibility: (id: string) => void;
  removeLayer: (id: string) => void;
  renameLayer: (id: string, newName: string) => void;
  colorPalette: string[];
  activeGeojsonLayerId: string | null;
  setActiveGeojsonLayerId: (id: string | null) => void;
  selectedFeatureId: string | number | null;
  updateLayerStyle: (layerId: string, featureId: string | number | null, styleChanges: any) => void;
  updateLayerOpacity: (layerId: string, opacity: number) => void;
  updateLayerDates?: (layerId: string, startDate?: string, endDate?: string) => void;
}) {
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
          title="Transparent"
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

  const Wrapper: any = isNested ? 'div' : Reorder.Item;
  const wrapperProps = isNested ? {} : {
    value: layer,
    dragListener: false,
    dragControls: controls,
    onDragOver: (e: any) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'link';
    },
    onDrop: (e: any) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId && draggedId !== layer.id && createSplit) {
        createSplit(draggedId, layer.id);
      }
    }
  };

  return (
    <div className={`flex flex-col ${isActiveEdit ? 'gap-0' : 'gap-[2px]'}`}>
      <Wrapper
        {...wrapperProps}
        className={`relative p-3 flex ${layer.type === 'split' ? 'items-start' : 'items-center'} gap-3 select-none group transition-opacity duration-200 ${isActiveEdit ? 'bg-white/10 z-10' : (layer.visible ? 'bg-black' : 'bg-transparent')} ${!layer.visible ? 'opacity-40' : 'opacity-100'}`}
      >
        {!isNested && (
          <div
            className={`cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70 ${layer.type === 'split' ? 'mt-1' : ''}`}
            onPointerDown={(e) => controls.start(e)}
          >
            <GripVertical size={16} />
          </div>
        )}
        <div data-layer-id={layer.id} className="absolute inset-0 pointer-events-none" />

        <button
          onClick={() => toggleVisibility(layer.id)}
          className={`text-white/50 hover:text-white transition-colors flex-shrink-0 ${layer.type === 'split' ? 'mt-[2px]' : ''}`}
        >
          {layer.visible ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>

        <div 
          className="flex-1 min-w-0" 
          onDoubleClick={handleDoubleClick}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', layer.id);
            e.dataTransfer.effectAllowed = 'link';
          }}
          title="Drag name onto another layer to split view"
        >
          {layer.type === 'split' ? (
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold truncate text-white">Split View Container</div>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider">{layer.splitLayers?.[0]?.name} | {layer.splitLayers?.[1]?.name}</div>
                </div>
                {removeSplit && !isNested && (
                  <button onClick={() => removeSplit(layer.id)} className="text-white/50 hover:text-white transition-colors" title="Remove Split View Container">
                    <Trash2 size={16} className="text-white" />
                  </button>
                )}
              </div>
              
              {layer.splitLayers && (
                <div className="flex flex-col gap-[2px] mt-3 border-t border-white/10 pt-3 -ml-6 -mr-3">
                  {layer.splitLayers.map(nestedLayer => (
                    <LayerItem
                      key={nestedLayer.id}
                      layer={nestedLayer}
                      isNested={true}
                      createSplit={createSplit}
                      removeSplit={removeSplit}
                      toggleVisibility={toggleVisibility}
                      removeLayer={removeLayer}
                      renameLayer={renameLayer}
                      colorPalette={colorPalette}
                      activeGeojsonLayerId={activeGeojsonLayerId}
                      setActiveGeojsonLayerId={setActiveGeojsonLayerId}
                      selectedFeatureId={selectedFeatureId}
                      updateLayerStyle={updateLayerStyle}
                      updateLayerOpacity={updateLayerOpacity}
                      updateLayerDates={updateLayerDates}
                    />
                  ))}
                </div>
              )}
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
                <div className="text-sm font-medium truncate cursor-text" title={layer.name}>{layer.name}</div>
              )}
              <div className="text-[10px] text-white/40 uppercase tracking-wider">{layer.type}</div>
            </>
          )}
        </div>

        {layer.type !== 'split' && (layer.type === 'geojson' || layer.type === 'raster') && layer.id !== 'deepstate' && layer.id !== 'satellite' && (
          <button
            onClick={() => {
              if (!layer.visible) toggleVisibility(layer.id);
              setActiveEdit();
            }}
            className={`transition-colors ${isActiveEdit ? 'text-white' : 'text-white/30 hover:text-white/70'}`}
            title={`Toggle ${layer.type === 'geojson' ? 'GeoJSON' : 'Layer'} Edit Mode`}
          >
            <Edit2 size={16} />
          </button>
        )}

        {layer.type !== 'split' && !['deepstate', 'satellite', 'copernicus'].includes(layer.id) && !isNested && (
          <button onClick={() => removeLayer(layer.id)} className="text-white/50 hover:text-white transition-colors ml-1">
            <Trash2 size={16} />
          </button>
        )}
      </Wrapper>

      {isActiveEdit && (
        <div className={`bg-white/10 p-3 pt-2 flex flex-col gap-4 text-sm animate-in slide-in-from-top-2 relative z-0 transition-opacity duration-200 ${!layer.visible ? 'opacity-40' : 'opacity-100'}`}>
          {layer.type === 'raster' ? (
            <div className="flex flex-col gap-3 pb-2">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white/50 font-semibold tracking-wider">OPACITY</label>
                  <span className="text-[10px] text-white/70 font-mono">{Math.round((layer.opacity ?? 1.0) * 100)}%</span>
                </div>
                <input
                  type="range" min="0" max="100"
                  value={(layer.opacity ?? 1.0) * 100}
                  onChange={e => updateLayerOpacity(layer.id, Number(e.target.value) / 100)}
                  className="w-full accent-white h-1 bg-white/20 appearance-none cursor-pointer"
                />
              </div>
              
              {layer.id === 'copernicus' && updateLayerDates && (
                <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-white/50 font-semibold tracking-wider">START DATE</label>
                    <input 
                      type="date" 
                      value={layer.startDate || defaultStartDate} 
                      onChange={e => updateLayerDates(layer.id, e.target.value, layer.endDate || defaultEndDate)}
                      className="bg-black border border-white/20 px-2 py-1 text-xs text-white outline-none focus:border-white/50"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-white/50 font-semibold tracking-wider">END DATE</label>
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
                    title="Edit Fill"
                  >
                    <Square size={16} fill="currentColor" stroke="none" />
                  </button>
                  <button
                    onClick={() => setEditTarget('outline')}
                    className={`p-1 flex items-center justify-center transition-colors ${editTarget === 'outline' ? 'text-white' : 'text-white/50 hover:text-white'}`}
                    title="Edit Outline"
                  >
                    <Square size={16} />
                  </button>
                  <button onClick={handleSwap} className="text-white/50 hover:text-white transition-colors p-1" title="Swap Fill and Outline">
                    <RefreshCcw size={16} />
                  </button>
                </div>

                {/* Reset */}
                <div className="flex gap-2">
                  <button onClick={handleReset} className="text-white/50 hover:text-white transition-colors p-1" title="Reset Styles">
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>

              {/* Opacity slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] text-white/50 font-semibold tracking-wider">OPACITY</label>
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
                  <label className="text-[10px] text-white/50 font-semibold tracking-wider">STROKE WIDTH</label>
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
    </div>
  );
}
