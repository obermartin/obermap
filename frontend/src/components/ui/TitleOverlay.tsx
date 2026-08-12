
import type { AppSettings } from '../../types';

export interface TitleOverlayProps {
  settings: AppSettings;
  currentShow: string | null;
  accreditationLines: { identifier: string, source: string }[];
}

export function TitleOverlay({ settings, currentShow, accreditationLines }: TitleOverlayProps) {
  return (
    <div className="absolute right-8 z-40 flex flex-col items-end gap-[2px] pointer-events-none transition-all duration-300 ease-in-out" style={{ bottom: `${80 + (settings.uiBottomPadding || 0)}px` }}>
      <div className="bg-white px-4 py-2 mb-1">
        <span className="text-black font-bold tracking-widest uppercase text-xs">
          {settings.title || currentShow}
        </span>
      </div>
      {accreditationLines.map((line, idx) => (
        <div key={idx} className="bg-white px-[3px] py-[1px] flex items-center gap-1.5">
          <span className="text-black font-bold uppercase text-[10px] tracking-wider">{line.identifier}:</span>
          <span className="text-black text-[10px] font-medium">{line.source}</span>
        </div>
      ))}
    </div>
  );
}
