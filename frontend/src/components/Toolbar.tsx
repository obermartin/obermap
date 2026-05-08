import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, Highlighter, Paintbrush, Hexagon, Circle as CircleIcon, Ruler, Save, Trash2, X, MapPin, Loader2, ArrowUpRight } from 'lucide-react';
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
  isSaving?: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const TOOLS = [
  { id: 'highlight', icon: Highlighter, label: 'Highlight Place' },
  { id: 'label', icon: Tag, label: 'Label' },
  { id: 'paint', icon: Paintbrush, label: 'Paint (Freehand)' },
  { id: 'polygon', icon: Hexagon, label: 'Polygon' },
  { id: 'circle', icon: CircleIcon, label: 'Circle' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
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
  isSaving,
  isOpen,
  setIsOpen
}) => {
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

  return (
    <div className="relative flex flex-col items-start max-w-[calc(100vw-3rem)] sm:max-w-none">
      <AnimatePresence>
        {isOpen && activeTool === 'icon' && (
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

        {isOpen && (
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
                  const isActive = activeTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => {
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
                  onClick={onSave}
                  disabled={isSaving}
                  className={`w-12 flex justify-center items-center transition-colors ${isSaving ? 'text-white cursor-wait' : 'text-white/60 hover:text-white hover:bg-white/20'}`}
                  title={isSaving ? "Saving..." : "Save Annotations & Settings"}
                >
                  {isSaving ? <Loader2 className="animate-spin" size={20} strokeWidth={1.5} /> : <Save size={20} strokeWidth={1.5} />}
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
            } else {
              setActiveTool('none');
            }
          }}
          className="w-12 h-12 flex items-center justify-center bg-black text-white hover:bg-white hover:text-black transition-colors shrink-0"
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
