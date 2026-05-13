import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, MousePointer2, Paintbrush, Hexagon, Circle as CircleIcon, Ruler, Save, Trash2, X, MapPin, Loader2, ArrowUpRight, ChevronLeft, ChevronRight, Route, Car, Footprints, TrainFront, Download } from 'lucide-react';
import type { ToolType, AppSettings, StrokeType, RouteMode } from '../types';
import clsx from 'clsx';
import { useTranslation } from '../contexts/I18nContext';

interface ToolbarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  currentColor: string;
  setCurrentColor: (color: string) => void;
  currentStrokeType?: StrokeType;
  setCurrentStrokeType?: (type: StrokeType) => void;
  currentFillOpacity?: number;
  setCurrentFillOpacity?: (opacity: number) => void;
  routeMode?: RouteMode;
  setRouteMode?: (mode: RouteMode) => void;
  onSave: () => void;
  onExport: () => void;
  onDelete: () => void;
  hasSelection: boolean;
  settings: AppSettings;
  isSaving?: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  selectedIconId?: string | null;
  setSelectedIconId?: (id: string | null) => void;
}

const TOOLS = [
  { id: 'highlight', icon: MousePointer2, label: 'Select Place/Country' },
  { id: 'label', icon: Tag, label: 'Label' },
  { id: 'paint', icon: Paintbrush, label: 'Paint (Freehand)' },
  { id: 'polygon', icon: Hexagon, label: 'Polygon' },
  { id: 'circle', icon: CircleIcon, label: 'Circle' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { id: 'measure', icon: Ruler, label: 'Measure' },
  { id: 'route', icon: Route, label: 'Route Planner' },
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
  currentStrokeType = 'solid',
  setCurrentStrokeType,
  currentFillOpacity,
  setCurrentFillOpacity,
  routeMode,
  setRouteMode,
  onSave,
  onExport,
  onDelete,
  hasSelection,
  settings,
  isSaving,
  isOpen,
  setIsOpen,
  selectedIconId,
  setSelectedIconId
}) => {
  const { t } = useTranslation();
  const [currentIconCategoryIdx, setCurrentIconCategoryIdx] = React.useState(0);

  const startIconDrag = (e: React.PointerEvent, iconId: string) => {
    if (activeTool !== 'icon') return;
    const iconObj = settings.icons?.[currentIconCategoryIdx]?.icons?.find(i => i.id === iconId);
    if (!iconObj) return;

    // Immediately select the icon so they can click to place later
    if (setSelectedIconId) {
      setSelectedIconId(iconId);
    }

    let hasDragged = false;
    const startX = e.clientX;
    const startY = e.clientY;
    let ghost: HTMLDivElement | null = null;

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!hasDragged) {
        const dist = Math.sqrt(Math.pow(moveEvent.clientX - startX, 2) + Math.pow(moveEvent.clientY - startY, 2));
        if (dist > 5) {
          hasDragged = true;
          ghost = document.createElement('div');
          ghost.className = 'fixed pointer-events-none z-[100] w-8 h-8 flex items-center justify-center opacity-80 p-1 icon-svg-wrapper';
          ghost.style.backgroundColor = currentColor;
          ghost.style.color = getContrastYIQ(currentColor);
          ghost.innerHTML = iconObj.svg;
          ghost.style.left = `${moveEvent.clientX - 16}px`;
          ghost.style.top = `${moveEvent.clientY - 16}px`;
          document.body.appendChild(ghost);
        }
      } else if (ghost) {
        ghost.style.left = `${moveEvent.clientX - 16}px`;
        ghost.style.top = `${moveEvent.clientY - 16}px`;
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      if (hasDragged && ghost) {
        document.body.removeChild(ghost);
        const dropEvent = new CustomEvent('requestDropIcon', {
          detail: {
            clientX: upEvent.clientX,
            clientY: upEvent.clientY,
            iconId,
            color: currentColor
          }
        });
        window.dispatchEvent(dropEvent);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const showStrokeControls = ['paint', 'polygon', 'circle', 'arrow', 'highlight'].includes(activeTool);
  const showFillOpacityControl = ['highlight', 'polygon', 'circle'].includes(activeTool);

  return (
    <div className="relative flex flex-col gap-1 items-start max-w-[calc(100vw-3rem)] sm:max-w-none">
      <AnimatePresence>
        {isOpen && activeTool === 'icon' && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center p-1 gap-1 relative max-w-full bg-black overflow-x-auto overflow-y-hidden no-scrollbar shrink-0 rounded-full shadow-lg"
          >
            <div className="flex flex-col justify-center items-center px-3 min-w-[80px]">
              <span className="text-[10px] text-white/50 uppercase font-bold tracking-wider mb-1">
                {t(settings.icons?.[currentIconCategoryIdx]?.name || 'Icons')}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentIconCategoryIdx(prev => (prev > 0 ? prev - 1 : (settings.icons?.length || 1) - 1))}
                  className="p-1 hover:bg-white/20 text-white/60 hover:text-white rounded"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setCurrentIconCategoryIdx(prev => (prev < (settings.icons?.length || 1) - 1 ? prev + 1 : 0))}
                  className="p-1 hover:bg-white/20 text-white/60 hover:text-white rounded"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="w-[1px] h-8 bg-white/20 mx-1 shrink-0" />

            {settings.icons?.[currentIconCategoryIdx]?.icons?.map((iconObj) => (
              <button
                key={iconObj.id}
                onPointerDown={(e) => startIconDrag(e, iconObj.id)}
                className={`w-10 h-10 rounded-full relative flex justify-center items-center cursor-pointer shrink-0 p-2 icon-svg-wrapper z-10 transition-colors ${selectedIconId === iconObj.id ? 'text-black' : 'text-white hover:opacity-80'}`}
                style={selectedIconId === iconObj.id ? {} : { backgroundColor: currentColor, color: getContrastYIQ(currentColor) }}
                title={t("Click to select, or drag to place")}
              >
                {selectedIconId === iconObj.id && (
                  <motion.div layoutId="icon-active-bg" className="absolute inset-0 bg-white rounded-full -z-10" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <div dangerouslySetInnerHTML={{ __html: iconObj.svg }} className="w-full h-full pointer-events-none" />
              </button>
            ))}
          </motion.div>
        )}

        {isOpen && showStrokeControls && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center p-1 gap-1 relative max-w-full overflow-x-auto overflow-y-hidden no-scrollbar shrink-0 bg-black rounded-full shadow-lg"
          >
            {[
              { id: 'solid', label: 'Solid Line' },
              { id: 'dashed', label: 'Dashed Line' },
              { id: 'dotted', label: 'Dotted Line' }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setCurrentStrokeType?.(type.id as any)}
                className={`group w-10 h-10 rounded-full relative flex justify-center items-center shrink-0 z-10 transition-colors ${currentStrokeType === type.id ? 'text-black' : 'text-white hover:text-white/80'}`}
                title={t(type.label)}
              >
                {currentStrokeType === type.id && (
                  <motion.div layoutId="stroke-active-bg" className="absolute inset-0 bg-white rounded-full -z-10" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <div className={clsx("w-5 border-t-2", type.id === 'dashed' && 'border-dashed', type.id === 'dotted' && 'border-dotted')} style={{ borderColor: 'currentColor' }} />
              </button>
            ))}
          </motion.div>
        )}

        {isOpen && activeTool === 'route' && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center p-1 gap-1 relative max-w-full overflow-x-auto overflow-y-hidden no-scrollbar shrink-0 bg-black rounded-full shadow-lg"
          >
            {[
              { id: 'driving', icon: Car, label: 'Car' },
              { id: 'walking', icon: Footprints, label: 'Walk' },
              { id: 'train', icon: TrainFront, label: 'Train' }
            ].map(mode => (
              <button
                key={mode.id}
                onClick={() => setRouteMode?.(mode.id as RouteMode)}
                className={`group w-10 h-10 rounded-full relative flex justify-center items-center shrink-0 z-10 transition-colors ${routeMode === mode.id ? 'text-black' : 'text-white hover:text-white/80'}`}
                title={t(mode.label)}
              >
                {routeMode === mode.id && (
                  <motion.div layoutId="route-active-bg" className="absolute inset-0 bg-white rounded-full -z-10" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                )}
                <mode.icon size={18} />
              </button>
            ))}
          </motion.div>
        )}

        {isOpen && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-3 p-2 relative max-w-full overflow-x-auto overflow-y-hidden no-scrollbar shrink-0"
          >
            {settings.colorPalette.map((c) => (
              <button
                key={c}
                onClick={() => setCurrentColor(c)}
                className={clsx(
                  "w-8 h-8 rounded-full shrink-0 transition-all",
                  currentColor === c ? "outline outline-2 outline-white outline-offset-[4px]" : "hover:outline hover:outline-2 hover:outline-white/50 hover:outline-offset-[4px]"
                )}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            
            <AnimatePresence>
              {showFillOpacityControl && setCurrentFillOpacity && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  className="flex items-center px-4 ml-3 h-10 shrink-0 bg-black rounded-full shadow-lg"
                >
                  <label className="text-white text-xs font-bold mr-3 uppercase tracking-wider">{t('Fill')}</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1" 
                    value={currentFillOpacity ?? 0.5} 
                    onChange={(e) => setCurrentFillOpacity(parseFloat(e.target.value))}
                    className="w-24 accent-white"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

      </AnimatePresence>

      <div className="flex bg-black items-center h-12 text-white max-w-full shrink-0 shadow-lg rounded-full overflow-hidden p-1 gap-1">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center overflow-x-auto overflow-y-hidden whitespace-nowrap no-scrollbar gap-1 pr-1"
            >
              <div className="flex items-center shrink-0 gap-1">
                {TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  const isActive = activeTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => {
                        setActiveTool(isActive ? 'none' : tool.id);
                      }}
                      className={`w-10 h-10 flex justify-center items-center transition-colors group relative rounded-full z-10 shrink-0 ${isActive ? 'text-black' : 'text-white hover:text-white/80'}`}
                      title={t(tool.label)}
                    >
                      {isActive && (
                        <motion.div layoutId="main-active-bg" className="absolute inset-0 bg-white rounded-full -z-10" transition={{ type: "spring", stiffness: 400, damping: 30 }} />
                      )}
                      <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                    </button>
                  );
                })}
              </div>

              <div className="w-[1px] bg-white/30 h-8 mx-1 shrink-0" />

              <div className="flex items-center shrink-0 gap-1">
                <button
                  onClick={onDelete}
                  disabled={!hasSelection && activeTool === 'none'}
                  className={`w-10 h-10 flex justify-center items-center transition-colors rounded-full shrink-0 ${hasSelection || activeTool !== 'none' ? 'text-white/60 hover:text-white hover:bg-white/20' : 'text-white/20 cursor-not-allowed'}`}
                  title={hasSelection ? t("Delete Selected") : t("Delete All Active Type")}
                >
                  <Trash2 size={20} strokeWidth={1.5} />
                </button>
                <button
                  onClick={onSave}
                  disabled={isSaving}
                  className={`w-10 h-10 flex justify-center items-center transition-colors rounded-full shrink-0 ${isSaving ? 'text-white cursor-wait' : 'text-white/60 hover:text-white hover:bg-white/20'}`}
                  title={isSaving ? t("Saving...") : t("Save Annotations & Settings")}
                >
                  {isSaving ? <Loader2 className="animate-spin" size={20} strokeWidth={1.5} /> : <Save size={20} strokeWidth={1.5} />}
                </button>
                <button
                  onClick={onExport}
                  className="w-10 h-10 flex justify-center items-center transition-colors text-white/60 hover:text-white hover:bg-white/20 rounded-full shrink-0"
                  title={t("Export Annotations as GeoJSON")}
                >
                  <Download size={20} strokeWidth={1.5} />
                </button>
              </div>

              <div className="w-[1px] bg-white/30 h-8 mx-1 shrink-0" />
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
          className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors shrink-0 z-10"
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
