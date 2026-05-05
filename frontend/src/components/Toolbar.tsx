import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, Highlighter, Paintbrush, Hexagon, Circle as CircleIcon, Ruler, Save, Trash2, X, Settings, MapPin } from 'lucide-react';
import type { ToolType, AppSettings } from '../types';
import clsx from 'clsx';

interface ToolbarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  currentColor: string;
  setCurrentColor: (color: string) => void;
  onSave: () => void;
  onDelete: () => void;
  hasSelection: boolean;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const TOOLS = [
  { id: 'highlight', icon: Highlighter, label: 'Highlight Place' },
  { id: 'label', icon: Tag, label: 'Label' },
  { id: 'paint', icon: Paintbrush, label: 'Paint (Freehand)' },
  { id: 'polygon', icon: Hexagon, label: 'Polygon' },
  { id: 'circle', icon: CircleIcon, label: 'Circle' },
  { id: 'measure', icon: Ruler, label: 'Measure' },
  { id: 'icon', icon: MapPin, label: 'Add Icon' },
] as const;

function getContrastYIQ(hexcolor: string) {
  if (!hexcolor) return '#ffffff';
  if (hexcolor.startsWith('#')) hexcolor = hexcolor.slice(1);
  if (hexcolor.length === 3) hexcolor = hexcolor.split('').map(c => c + c).join('');
  const r = parseInt(hexcolor.substr(0, 2), 16) || 0;
  const g = parseInt(hexcolor.substr(2, 2), 16) || 0;
  const b = parseInt(hexcolor.substr(4, 2), 16) || 0;
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  setActiveTool,
  currentColor,
  setCurrentColor,
  onSave,
  onDelete,
  hasSelection,
  settings,
  setSettings
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [addingColor, setAddingColor] = useState(false);
  const [newColorHex, setNewColorHex] = useState('#000000');

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  
  const iconDragItem = useRef<number | null>(null);
  const iconDragOverItem = useRef<number | null>(null);

  const startIconDrag = (e: React.PointerEvent, iconId: string) => {
    if (activeTool !== 'icon') return;
    e.preventDefault();
    const iconObj = settings.icons?.find(i => i.id === iconId);
    if (!iconObj) return;

    const ghost = document.createElement('div');
    ghost.className = 'fixed pointer-events-none z-[100] w-8 h-8 flex items-center justify-center opacity-80 p-1 icon-svg-wrapper';
    ghost.style.backgroundColor = currentColor;
    ghost.style.color = getContrastYIQ(currentColor);
    ghost.innerHTML = iconObj.svg;
    
    ghost.style.left = `${e.clientX - 16}px`;
    ghost.style.top = `${e.clientY - 16}px`;
    document.body.appendChild(ghost);

    const onPointerMove = (moveEvent: PointerEvent) => {
      ghost.style.left = `${moveEvent.clientX - 16}px`;
      ghost.style.top = `${moveEvent.clientY - 16}px`;
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      document.body.removeChild(ghost);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      const dropEvent = new CustomEvent('requestDropIcon', {
        detail: {
          clientX: upEvent.clientX,
          clientY: upEvent.clientY,
          iconId,
          color: currentColor
        }
      });
      window.dispatchEvent(dropEvent);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragItem.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
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



  const confirmAddColor = () => {
    if (/^#[0-9A-F]{6}$/i.test(newColorHex)) {
      setSettings(prev => ({ ...prev, colorPalette: [...prev.colorPalette, newColorHex.toUpperCase()] }));
      setAddingColor(false);
    } else {
      alert('Invalid hex color format. Use #RRGGBB');
    }
  };

  const removeColor = (color: string) => {
    setSettings(prev => ({ ...prev, colorPalette: prev.colorPalette.filter(c => c !== color) }));
  };

  const handleIconDragStart = (e: React.DragEvent, index: number) => {
    iconDragItem.current = index;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleIconDragEnter = (index: number) => {
    iconDragOverItem.current = index;
  };

  const handleIconDragEnd = () => {
    const fromIndex = iconDragItem.current;
    const toIndex = iconDragOverItem.current;

    if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
      setSettings(prev => {
        const newIcons = [...(prev.icons || [])];
        const [movedItem] = newIcons.splice(fromIndex, 1);
        newIcons.splice(toIndex, 0, movedItem);
        return { ...prev, icons: newIcons };
      });
    }
    iconDragItem.current = null;
    iconDragOverItem.current = null;
  };

  const removeIcon = (iconId: string) => {
    setSettings(prev => ({ ...prev, icons: (prev.icons || []).filter(i => i.id !== iconId) }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text.includes('<svg')) {
        const newIcon = {
          id: `icon-${Date.now()}`,
          svg: text
        };
        setSettings(prev => ({
          ...prev,
          icons: [...(prev.icons || []), newIcon]
        }));
      } else {
        alert('Invalid SVG file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="absolute bottom-6 left-6 z-10 flex flex-col items-start max-w-[calc(100vw-3rem)] sm:max-w-none">
      <AnimatePresence>
        {isOpen && !isSettingsOpen && activeTool === 'icon' && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex relative max-w-full overflow-x-auto overflow-y-hidden no-scrollbar shrink-0"
          >
            {settings.icons?.map((iconObj) => (
              <button
                key={iconObj.id}
                onPointerDown={(e) => startIconDrag(e, iconObj.id)}
                className="w-12 h-12 relative flex justify-center items-center cursor-grab active:cursor-grabbing border-r border-white/20 shrink-0 p-2 icon-svg-wrapper bg-white/10"
                style={{ backgroundColor: currentColor, color: getContrastYIQ(currentColor) }}
                title="Drag to place on map"
                dangerouslySetInnerHTML={{ __html: iconObj.svg }}
              />
            ))}
          </motion.div>
        )}

        {isOpen && !isSettingsOpen && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex relative border-b-2 border-white max-w-full overflow-x-auto overflow-y-hidden no-scrollbar shrink-0"
          >
            {settings.colorPalette.map((c) => (
              <button
                key={c}
                onClick={() => setCurrentColor(c)}
                className="w-12 h-12 relative flex justify-center items-end shrink-0"
                style={{ backgroundColor: c }}
                title={c}
              >
                {currentColor === c && (
                  <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-white absolute -bottom-[0px]" />
                )}
              </button>
            ))}
          </motion.div>
        )}

        {isOpen && isSettingsOpen && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-black border border-white/20 p-4 mb-1 w-80 max-w-full text-white flex flex-col gap-4 shadow-xl shrink-0 overflow-y-auto max-h-[60vh] no-scrollbar"
          >

            <div>
              <label className="text-xs text-white/50 mb-1 block font-semibold tracking-wider">COLOR PALETTE</label>
              <div className="flex flex-wrap gap-2 items-center">
                {settings.colorPalette.map((c, index) => (
                  <div 
                    key={c} 
                    className="w-6 h-6 border border-white/20 relative group cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnter={() => handleDragEnter(index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="w-full h-full" style={{ backgroundColor: c }} />
                    <button 
                      onClick={() => removeColor(c)}
                      className="absolute inset-0 bg-black/60 text-white hidden group-hover:flex items-center justify-center text-xs font-bold transition-opacity"
                      title="Remove color"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {!addingColor ? (
                  <button 
                    onClick={() => setAddingColor(true)}
                    className="w-6 h-6 border border-white/20 flex items-center justify-center hover:bg-white hover:text-black transition-colors shrink-0"
                    title="Add color"
                  >
                    +
                  </button>
                ) : (
                  <div className="flex gap-1 items-center shrink-0 bg-white/5 border border-white/20 p-1">
                    <input 
                      type="color"
                      className="w-6 h-6 p-0 border-0 cursor-pointer bg-transparent"
                      value={newColorHex}
                      onChange={e => setNewColorHex(e.target.value.toUpperCase())}
                      title="Choose a color"
                    />
                    <input 
                      autoFocus
                      className="w-20 bg-transparent px-1 outline-none font-mono text-xs border border-transparent focus:border-white/50 transition-colors h-6 uppercase"
                      value={newColorHex}
                      onChange={e => setNewColorHex(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmAddColor();
                        if (e.key === 'Escape') setAddingColor(false);
                      }}
                    />
                    <button onClick={confirmAddColor} className="text-white hover:bg-white hover:text-black px-2 font-semibold border border-white/20 text-xs h-6">OK</button>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className="text-xs text-white/50 mb-1 block font-semibold tracking-wider">ICONS</label>
              <div className="flex flex-wrap gap-2 items-center">
                {settings.icons?.map((iconObj, index) => (
                  <div 
                    key={iconObj.id} 
                    className="w-8 h-8 border border-white/20 relative group cursor-grab active:cursor-grabbing flex items-center justify-center bg-white/10"
                    draggable
                    onDragStart={(e) => handleIconDragStart(e, index)}
                    onDragEnter={() => handleIconDragEnter(index)}
                    onDragEnd={handleIconDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="w-full h-full p-1 icon-svg-wrapper" style={{ color: 'white' }} dangerouslySetInnerHTML={{ __html: iconObj.svg }} />
                    <button 
                      onClick={() => removeIcon(iconObj.id)}
                      className="absolute inset-0 bg-black/80 text-white hidden group-hover:flex items-center justify-center text-xs font-bold transition-opacity"
                      title="Remove icon"
                    >
                      ×
                    </button>
                  </div>
                ))}
                
                <label className="w-8 h-8 border border-white/20 flex items-center justify-center hover:bg-white hover:text-black transition-colors shrink-0 cursor-pointer" title="Upload SVG Icon">
                  +
                  <input type="file" accept=".svg" className="hidden" onChange={handleFileUpload} />
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex bg-black items-stretch h-12 text-white max-w-full shrink-0 shadow-lg">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-stretch overflow-x-auto overflow-y-hidden whitespace-nowrap no-scrollbar"
            >
              <div className="flex items-stretch shrink-0">
                {TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  const isActive = activeTool === tool.id && !isSettingsOpen;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setActiveTool(isActive ? 'none' : tool.id);
                      }}
                      className={clsx(
                        "w-12 flex justify-center items-center transition-colors group relative",
                        isActive ? "bg-white text-black" : "text-white hover:bg-white/20"
                      )}
                      title={tool.label}
                    >
                      <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                    </button>
                  );
                })}
              </div>

              <div className="w-[1px] bg-white/30 my-2 mx-1 shrink-0" />

              <div className="flex items-stretch shrink-0">
                <button
                  onClick={onDelete}
                  disabled={!hasSelection && activeTool === 'none'}
                  className={clsx(
                    "w-12 flex justify-center items-center transition-colors",
                    hasSelection || activeTool !== 'none'
                      ? "text-white/60 hover:text-white hover:bg-white/20"
                      : "text-white/20 cursor-not-allowed"
                  )}
                  title={hasSelection ? "Delete Selected" : "Delete All Active Type"}
                >
                  <Trash2 size={20} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className={clsx(
                    "w-12 flex justify-center items-center transition-colors",
                    isSettingsOpen ? "bg-white text-black" : "text-white/60 hover:text-white hover:bg-white/20"
                  )}
                  title="Settings"
                >
                  <Settings size={20} strokeWidth={isSettingsOpen ? 2.5 : 1.5} />
                </button>
                <button
                  onClick={onSave}
                  className="w-12 flex justify-center items-center text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                  title="Save Annotations & Settings"
                >
                  <Save size={20} strokeWidth={1.5} />
                </button>
              </div>

              <div className="w-[1px] bg-white/30 my-2 mx-1 shrink-0" />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => {
            const next = !isOpen;
            setIsOpen(next);
            if (next) {
              setActiveTool('highlight');
              setIsSettingsOpen(false);
            } else {
              setActiveTool('none');
            }
          }}
          className="w-12 h-12 flex items-center justify-center hover:bg-white/20 transition-colors shrink-0"
        >
          <X 
            size={24} 
            strokeWidth={1.5} 
            className={clsx("transition-transform duration-300", !isOpen && "rotate-45")} 
          />
        </button>
      </div>
    </div>
  );
};
