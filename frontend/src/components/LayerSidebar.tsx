import React, { useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, Eye, EyeOff, Upload, Link, X, Layers } from 'lucide-react';
import type { AppSettings, MapLayer } from '../types';
import { parseMapFile } from '../utils/fileUtils';

interface LayerSidebarProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function LayerSidebar({ settings, setSettings, isOpen, setIsOpen }: LayerSidebarProps) {
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

  const toggleLayerVisibility = (id: string) => {
    setSettings(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
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
      layers: prev.layers.map(l => l.id === id ? { ...l, name: newName } : l)
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const geojson = await parseMapFile(file);
      const newLayer: MapLayer = {
        id: `upload-${Date.now()}`,
        name: file.name,
        type: 'geojson',
        visible: true,
        data: geojson
      };
      setSettings(prev => ({ ...prev, layers: [newLayer, ...prev.layers] }));
    } catch (err) {
      alert('Error parsing file: ' + (err as Error).message);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    const newLayer: MapLayer = {
      id: `url-${Date.now()}`,
      name: 'Custom WMTS/ZYX',
      type: 'raster',
      visible: true,
      url: urlInput.trim()
    };
    setSettings(prev => ({ ...prev, layers: [newLayer, ...prev.layers] }));
    setUrlInput('');
    setShowUrlInput(false);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-zinc-900 border-l border-white/10 flex flex-col shadow-2xl z-40 text-white">
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

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            <label className="text-xs text-white/50 mb-1 block font-semibold tracking-wider">LAYER STACK</label>
            <Reorder.Group axis="y" values={settings.layers} onReorder={handleReorder} className="flex flex-col gap-2">
              {settings.layers.map(layer => (
                <LayerItem key={layer.id} layer={layer} toggleVisibility={toggleLayerVisibility} removeLayer={removeLayer} renameLayer={renameLayer} />
              ))}
            </Reorder.Group>
          </div>

          <div className="p-4 border-t border-white/10 flex flex-col gap-3">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-2 text-sm transition-colors"
            >
              <Upload size={16} /> Upload GeoJSON/KML/KMZ
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".json,.geojson,.kml,.kmz" className="hidden" />

            {showUrlInput ? (
              <div className="flex flex-col gap-2">
                <input 
                  type="text" 
                  placeholder="WMTS/ZYX URL..." 
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
                className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-2 text-sm transition-colors"
              >
                <Link size={16} /> Add ZYX/WMTS URL
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="p-4 flex flex-col gap-6 flex-1 overflow-y-auto">
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
              className="w-full py-2 bg-white/10 hover:bg-white hover:text-black border border-white/10 flex items-center justify-center gap-2 text-sm transition-colors font-semibold tracking-wider"
            >
              CAPTURE CURRENT VIEW
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LayerItem({ layer, toggleVisibility, removeLayer, renameLayer }: { 
  layer: MapLayer; 
  toggleVisibility: (id: string) => void;
  removeLayer: (id: string) => void;
  renameLayer: (id: string, newName: string) => void;
}) {
  const controls = useDragControls();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(layer.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = () => {
    if (['deepstate', 'satellite'].includes(layer.id)) return; // Prevent renaming default layers
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

  return (
    <Reorder.Item 
      value={layer} 
      dragListener={false} 
      dragControls={controls}
      className="bg-black/40 border border-white/10 p-3 flex items-center gap-3 select-none group"
    >
      <div 
        className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70"
        onPointerDown={(e) => controls.start(e)}
      >
        <GripVertical size={16} />
      </div>
      <div className="flex-1 overflow-hidden" onDoubleClick={handleDoubleClick}>
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
      </div>
      <button 
        onClick={() => toggleVisibility(layer.id)}
        className="text-white/50 hover:text-white transition-colors"
      >
        {layer.visible ? <Eye size={18} /> : <EyeOff size={18} />}
      </button>
      {!['deepstate', 'satellite'].includes(layer.id) && (
        <button onClick={() => removeLayer(layer.id)} className="text-red-400/50 hover:text-red-400 ml-1">
          <X size={16} />
        </button>
      )}
    </Reorder.Item>
  );
}
