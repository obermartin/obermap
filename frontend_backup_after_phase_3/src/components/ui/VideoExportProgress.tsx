import { createPortal } from 'react-dom';

import type { VideoExportState } from '../../hooks/useVideoExport';

interface VideoExportProgressProps {
  videoExportState: VideoExportState | null;
}

export function VideoExportProgress({ videoExportState }: VideoExportProgressProps) {
  

  if (!videoExportState) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center text-white" style={{ isolation: 'isolate' }}>
      <div className="flex flex-col items-center space-y-8 animate-pulse-slow">
        <div className="flex items-center space-x-4">
          <div className="w-4 h-4 rounded-full bg-red-500 animate-ping"></div>
          <h2 className="text-xl font-bold tracking-widest uppercase">{videoExportState.message}</h2>
        </div>
        <div className="w-96 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-300 ease-out"
            style={{ width: `${(videoExportState.progress / videoExportState.total) * 100}%` }}
          />
        </div>
        <div className="font-mono text-sm text-gray-400">
          View {videoExportState.progress} of {videoExportState.total}
        </div>
      </div>
    </div>,
    document.body
  );
}
