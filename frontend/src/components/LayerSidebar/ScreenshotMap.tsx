import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

export const ScreenshotMap = ({ styleUrl, onReady }: { styleUrl: string, onReady: (dataUrl: string) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    let mapStyle = styleUrl;
    if (typeof styleUrl === 'string' && styleUrl.startsWith('solid:')) {
      mapStyle = {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'solid-bg-layer',
            type: 'background',
            paint: { 'background-color': styleUrl.replace('solid:', '') }
          }
        ]
      } as any;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [10.45, 51.16],
      zoom: 4,
      preserveDrawingBuffer: true,
      interactive: false,
      attributionControl: false
    } as any);

    let isRemoved = false;
    map.once('idle', () => {
      if (isRemoved) return;
      try {
        const data = map.getCanvas().toDataURL('image/png');
        onReady(data);
      } catch (e) {
        console.error("Screenshot capture failed:", e);
      }
    });

    return () => {
      if (!isRemoved) {
        isRemoved = true;
        map.remove();
      }
    };
  }, [styleUrl, onReady]);

  return (
    <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '256px', height: '256px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
