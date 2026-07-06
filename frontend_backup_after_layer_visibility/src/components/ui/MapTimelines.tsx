import React from 'react';
import type { MapLayer, AppSettings } from '../../types';

interface CycloneTimelineOverlayProps {
  isCycloneLayerVisible: boolean;
  selectedCycloneId: { id: string; ep: string; } | null;
  isSidebarOpen?: boolean;
  isToolbarOpen?: boolean;
  cycloneTimelinePercent: number;
  setCycloneTimelinePercent: (percent: number) => void;
}

export const CycloneTimelineOverlay: React.FC<CycloneTimelineOverlayProps> = ({
  isCycloneLayerVisible,
  selectedCycloneId,
  isSidebarOpen,
  isToolbarOpen,
  cycloneTimelinePercent,
  setCycloneTimelinePercent
}) => {
  if (!selectedCycloneId || !isCycloneLayerVisible) return null;

  return (
    <div 
      className="absolute bottom-[5rem] h-12 z-40 flex justify-center items-center transition-all duration-300 ease-in-out pointer-events-none"
      style={{
        left: `calc(104px + ${isSidebarOpen ? '320px' : '0px'} + ${isToolbarOpen ? '640px' : '48px'})`,
        right: '160px',
      }}
    >
      <div className="w-[75%] h-full bg-black rounded-full px-6 shadow-lg flex items-center justify-between pointer-events-auto relative">
        <span className="text-white/50 font-mono text-[10px] font-bold z-10 w-10 select-none">START</span>
        
        <div className="flex-1 relative h-6 flex items-center mx-4 group">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-white/30 rounded-lg pointer-events-none z-0" />
          
          <div 
            className="absolute top-1/2 -translate-y-1/2 bg-white rounded-full flex items-center justify-center pointer-events-none z-10 font-bold text-black shadow-md transition-transform group-hover:scale-105 select-none"
            style={{
              left: `calc(${cycloneTimelinePercent}% + (${0.5 - (cycloneTimelinePercent / 100)} * 48px))`,
              width: '48px',
              height: '20px',
              fontFamily: 'Roboto, sans-serif',
              fontSize: '11px',
            }}
          >
            {Math.round(cycloneTimelinePercent)}%
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={cycloneTimelinePercent}
            onChange={(e) => setCycloneTimelinePercent(Number(e.target.value))}
            onTouchStart={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const update = (clientX: number) => {
                const x = clientX - rect.left;
                const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
                setCycloneTimelinePercent(pct);
              };
              update(e.touches[0].clientX);
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.touches[0].clientX - rect.left;
              const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
              setCycloneTimelinePercent(pct);
            }}
            onTouchEnd={(e) => e.stopPropagation()}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[48px] [&::-webkit-slider-thumb]:h-[20px]"
          />
        </div>
        
        <span className="text-white/50 font-mono text-[10px] font-bold z-10 w-10 text-right select-none">END</span>
      </div>
    </div>
  );
};

interface NighttimeTimelineOverlayProps {
  isNighttimeLayerVisible: boolean;
  selectedCycloneId: { id: string; ep: string; } | null;
  isCycloneLayerVisible: boolean;
  hasDateLayers: boolean;
  isSidebarOpen?: boolean;
  isToolbarOpen?: boolean;
  nighttimeHour: number;
  setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
  activeNighttimeLayer?: MapLayer;
}

export const NighttimeTimelineOverlay: React.FC<NighttimeTimelineOverlayProps> = ({
  isNighttimeLayerVisible,
  selectedCycloneId,
  isCycloneLayerVisible,
  hasDateLayers,
  isSidebarOpen,
  isToolbarOpen,
  nighttimeHour,
  setSettings,
  activeNighttimeLayer
}) => {
  if (!isNighttimeLayerVisible) return null;

  return (
    <div 
      className={`absolute h-12 z-40 flex justify-center items-center transition-all duration-300 ease-in-out pointer-events-none ${(selectedCycloneId && isCycloneLayerVisible) ? 'bottom-[8.5rem]' : (hasDateLayers ? 'bottom-[5rem]' : 'bottom-6')}`}
      style={{
        left: `calc(104px + ${isSidebarOpen ? '320px' : '0px'} + ${isToolbarOpen ? '640px' : '48px'})`,
        right: '160px',
      }}
    >
      <div className="w-[75%] h-full bg-black rounded-full px-6 shadow-lg flex items-center justify-between pointer-events-auto relative">
        <span className="text-white/50 font-mono text-[10px] font-bold z-10 w-8 select-none">00:00</span>
        
        <div className="flex-1 relative h-6 flex items-center mx-4 group">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-white/30 rounded-lg pointer-events-none z-0" />
          
          <div 
            className="absolute top-1/2 -translate-y-1/2 bg-white rounded-full flex items-center justify-center pointer-events-none z-10 font-bold text-black shadow-md transition-transform group-hover:scale-105 select-none"
            style={{
              left: `calc(${(nighttimeHour / 24) * 100}% + (${0.5 - (nighttimeHour / 24)} * 48px))`,
              width: '48px',
              height: '20px',
              fontFamily: 'Roboto, sans-serif',
              fontSize: '11px',
            }}
          >
            {Math.floor(nighttimeHour).toString().padStart(2, '0')}:{Math.floor((nighttimeHour % 1) * 60).toString().padStart(2, '0')}
          </div>

          <input
            type="range"
            min="0"
            max="24"
            step="0.1"
            value={nighttimeHour}
            onChange={(e) => {
              if (setSettings && activeNighttimeLayer) {
                setSettings(prev => ({
                  ...prev,
                  layers: prev.layers.map(l => l.id === activeNighttimeLayer.id ? { ...l, nighttimeHour: Number(e.target.value) } : l)
                }));
              }
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const update = (clientX: number) => {
                const x = clientX - rect.left;
                const val = Math.max(0, Math.min(24, (x / rect.width) * 24));
                if (setSettings && activeNighttimeLayer) {
                  setSettings(prev => ({
                    ...prev,
                    layers: prev.layers.map(l => l.id === activeNighttimeLayer.id ? { ...l, nighttimeHour: val } : l)
                  }));
                }
              };
              update(e.touches[0].clientX);
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.touches[0].clientX - rect.left;
              const val = Math.max(0, Math.min(24, (x / rect.width) * 24));
              if (setSettings && activeNighttimeLayer) {
                setSettings(prev => ({
                  ...prev,
                  layers: prev.layers.map(l => l.id === activeNighttimeLayer.id ? { ...l, nighttimeHour: val } : l)
                }));
              }
            }}
            onTouchEnd={(e) => e.stopPropagation()}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 m-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[48px] [&::-webkit-slider-thumb]:h-[20px]"
          />
        </div>
        
        <span className="text-white/50 font-mono text-[10px] font-bold z-10 w-8 text-right select-none">24:00</span>
      </div>
    </div>
  );
};
