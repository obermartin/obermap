import React, { useState, useEffect, useRef } from 'react';

interface CropOverlayProps {
  format: 'landscape' | 'portrait' | 'square';
  cropSetting: { scale: number; offsetX: number; offsetY: number };
  onChange: (setting: { scale: number; offsetX: number; offsetY: number }) => void;
}

export const CropOverlay: React.FC<CropOverlayProps> = ({ format, cropSetting, onChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, offsetX: 0, offsetY: 0, scale: 0 });

  const aspectRatios = {
    landscape: 16 / 9,
    portrait: 9 / 16,
    square: 1
  };
  const aspect = aspectRatios[format];

  const getContainerSize = () => {
    if (!containerRef.current) return { width: window.innerWidth, height: window.innerHeight };
    return { width: containerRef.current.clientWidth, height: containerRef.current.clientHeight };
  };

  const getMaxDims = (cW: number, cH: number) => {
    let w = cW;
    let h = cW / aspect;
    if (h > cH) {
      h = cH;
      w = cH * aspect;
    }
    return { w, h };
  };

  const handlePointerDown = (e: React.PointerEvent, action: string) => {
    e.stopPropagation();
    if (action === 'drag') {
      setIsDragging(true);
    } else {
      setIsResizing(action);
    }
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      offsetX: cropSetting.offsetX,
      offsetY: cropSetting.offsetY,
      scale: cropSetting.scale
    });
    
    if (containerRef.current) {
        containerRef.current.setPointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging && !isResizing) return;
      
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      if (isDragging) {
        onChange({
          ...cropSetting,
          offsetX: dragStart.offsetX + dx,
          offsetY: dragStart.offsetY + dy
        });
      } else if (isResizing) {
        const { width: cW, height: cH } = getContainerSize();
        const { w: maxW } = getMaxDims(cW, cH);
        
        let dw = 0;
        
        if (isResizing.includes('e')) dw = dx;
        else if (isResizing.includes('w')) dw = -dx;
        else if (isResizing.includes('s')) dw = dy * aspect;
        else if (isResizing.includes('n')) dw = -dy * aspect;
        
        // When dragging corners, both X and Y movement should contribute, or just pick one axis.
        // Usually, picking the primary axis of movement is more robust.
        // Let's use the X distance to scale, maintaining aspect ratio.
        if (isResizing === 'se' || isResizing === 'sw' || isResizing === 'ne' || isResizing === 'nw') {
            if (isResizing === 'se') dw = dx;
            if (isResizing === 'sw') dw = -dx;
            if (isResizing === 'ne') dw = dx;
            if (isResizing === 'nw') dw = -dx;
            
            // Allow Y to also drive scale if moving mostly vertically
            if (Math.abs(dy) > Math.abs(dx)) {
                if (isResizing === 'se') dw = dy * aspect;
                if (isResizing === 'sw') dw = dy * aspect;
                if (isResizing === 'ne') dw = -dy * aspect;
                if (isResizing === 'nw') dw = -dy * aspect;
            }
        }

        // Current width based on dragStart
        const startW = maxW * dragStart.scale;
        let newW = startW + dw * 2; // multiply by 2 because we are scaling from the center
        
        // Clamp scale
        const minScale = 0.1;
        const newScale = Math.max(minScale, Math.min(1, newW / maxW));
        
        onChange({
          ...cropSetting,
          scale: newScale
        });
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isDragging || isResizing) {
          setIsDragging(false);
          setIsResizing(null);
          if (containerRef.current && containerRef.current.hasPointerCapture(e.pointerId)) {
              containerRef.current.releasePointerCapture(e.pointerId);
          }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, isResizing, dragStart, cropSetting, onChange, aspect]);

  const [dims, setDims] = useState({ cW: window.innerWidth, cH: window.innerHeight });
  
  useEffect(() => {
    const updateDims = () => {
        const size = getContainerSize();
        setDims({ cW: size.width, cH: size.height });
    };
    window.addEventListener('resize', updateDims);
    updateDims();
    return () => window.removeEventListener('resize', updateDims);
  }, []);

  const { w: maxW, h: maxH } = getMaxDims(dims.cW, dims.cH);
  
  const width = maxW * cropSetting.scale;
  const height = maxH * cropSetting.scale;
  
  const left = (dims.cW - width) / 2 + cropSetting.offsetX;
  const top = (dims.cH - height) / 2 + cropSetting.offsetY;

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-[150] pointer-events-none overflow-hidden"
    >
      <div 
        className="absolute border-[3px] border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move pointer-events-auto"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
          boxSizing: 'border-box'
        }}
        onPointerDown={(e) => handlePointerDown(e, 'drag')}
      >
        <div className="absolute inset-0 pointer-events-none opacity-30 flex flex-col justify-between">
          <div className="w-full border-t border-white" style={{ marginTop: '33.33%' }} />
          <div className="w-full border-t border-white" style={{ marginBottom: '33.33%' }} />
        </div>
        <div className="absolute inset-0 pointer-events-none opacity-30 flex justify-between">
          <div className="h-full border-l border-white" style={{ marginLeft: '33.33%' }} />
          <div className="h-full border-l border-white" style={{ marginRight: '33.33%' }} />
        </div>

        <div 
          className="absolute w-6 h-6 bg-white shadow-md border-2 border-black/20 cursor-nwse-resize"
          style={{ top: 0, left: 0, transform: 'translate(-50%, -50%)', pointerEvents: 'auto' }}
          onPointerDown={(e) => handlePointerDown(e, 'nw')}
        />
        <div 
          className="absolute w-6 h-6 bg-white shadow-md border-2 border-black/20 cursor-nesw-resize"
          style={{ top: 0, right: 0, transform: 'translate(50%, -50%)', pointerEvents: 'auto' }}
          onPointerDown={(e) => handlePointerDown(e, 'ne')}
        />
        <div 
          className="absolute w-6 h-6 bg-white shadow-md border-2 border-black/20 cursor-nesw-resize"
          style={{ bottom: 0, left: 0, transform: 'translate(-50%, 50%)', pointerEvents: 'auto' }}
          onPointerDown={(e) => handlePointerDown(e, 'sw')}
        />
        <div 
          className="absolute w-6 h-6 bg-white shadow-md border-2 border-black/20 cursor-nwse-resize"
          style={{ bottom: 0, right: 0, transform: 'translate(50%, 50%)', pointerEvents: 'auto' }}
          onPointerDown={(e) => handlePointerDown(e, 'se')}
        />
      </div>
    </div>
  );
};
