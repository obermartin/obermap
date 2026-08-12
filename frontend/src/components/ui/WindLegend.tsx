import React from 'react';

interface WindLegendProps {
  isSidebarOpen?: boolean;
  uiBottomPadding?: number;
}

export const WindLegend: React.FC<WindLegendProps> = ({
  isSidebarOpen,
  uiBottomPadding = 0
}) => {
  const windLegendStops = [
    { label: '0-8', color: '#334155' },
    { label: '8-18', color: '#2563eb' },
    { label: '18-30', color: '#22d3ee' },
    { label: '30-45', color: '#4ade80' },
    { label: '45-60', color: '#facc15' },
    { label: '60-80', color: '#f97316' },
    { label: '80-105', color: '#ef4444' },
    { label: '105-130', color: '#a855f7' },
    { label: '130+', color: '#ffffff' }
  ];

  return (
    <div 
      className={`absolute left-6 z-30 max-w-[calc(100vw-3rem)] flex flex-col gap-2 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-[20rem]' : 'translate-x-0'}`}
      style={{ bottom: `${80 + uiBottomPadding}px` }}
    >
      <div className="bg-black border border-white/20 text-white flex items-center gap-1.5 px-3 h-12 w-fit max-w-full overflow-x-auto no-scrollbar">
        <span className="text-[10px] text-white/50 font-semibold tracking-wider uppercase shrink-0">Wind Speed</span>
        <div className="flex items-center gap-1.5 shrink-0 border-l border-white/20 pl-3 ml-1.5">
          <span className="text-[10px] text-white/50 font-semibold tracking-wider uppercase">km/h</span>
          {windLegendStops.map((stop, idx) => (
            <div key={stop.label || `wind-stop-${idx}`} className="flex items-center gap-1">
              <span
                className="w-3 h-3 border border-white/20"
                style={{ backgroundColor: stop.color }}
              />
              <span className="text-[10px] text-white/70 font-mono">{stop.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
