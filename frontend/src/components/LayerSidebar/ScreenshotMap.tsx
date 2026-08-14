import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { applyMapFontOverridesToStyleJson } from "../../map/fonts";

export const ScreenshotMap = ({ styleUrl, onReady, settings }: { styleUrl: string, onReady: (dataUrl: string) => void, settings?: any }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const initMap = (mapStyle: any) => {
      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: mapStyle,
        center: [10.45, 51.16],
        zoom: 4,
        preserveDrawingBuffer: true,
        interactive: false,
        attributionControl: false,
      transformRequest: (url: string, resourceType?: string) => {
        let currentUrl = url;
        
        if (resourceType === 'Glyphs' && currentUrl.includes('orangemug.github.io/font-glyphs')) {
          currentUrl = currentUrl.replace('https://orangemug.github.io/font-glyphs/glyphs/', 'https://tiles.openfreemap.org/fonts/');
          currentUrl = currentUrl.replace(/Arial(?:%20| )Unicode(?:%20| )MS(?:%20| )Regular/gi, 'Noto%20Sans%20Regular');
        }

        if (currentUrl.includes('virtualearth.net/tiles/a/')) {
          const match = currentUrl.match(/\/tiles\/a\/(\d+)\/(\d+)\/(\d+)/);
          if (match) {
            const z = parseInt(match[1], 10);
            const x = parseInt(match[2], 10);
            const y = parseInt(match[3], 10);
            let quadKey = '';
            for (let i = z; i > 0; i--) {
              let digit = 0;
              const mask = 1 << (i - 1);
              if ((x & mask) !== 0) digit += 1;
              if ((y & mask) !== 0) digit += 2;
              quadKey += digit.toString();
            }
            return { url: currentUrl.replace(/\/tiles\/a\/\d+\/\d+\/\d+/, `/tiles/a${quadKey}`) };
          }
        }
        
        if (currentUrl.includes('Gotham')) {
          try {
            const urlObj = new URL(currentUrl);
            const parts = urlObj.pathname.split('/');
            const range = parts.pop();
            const fontstack = decodeURIComponent(parts.pop() || '');
            if (fontstack.startsWith('Gotham Condensed')) {
              const primaryFont = fontstack.split(',')[0].trim();
              const pathname = window.location.pathname;
              const cleanPath = pathname.endsWith('/') ? pathname : pathname.substring(0, pathname.lastIndexOf('/') + 1);
              return { url: `${window.location.origin}${cleanPath}fonts/PBF/${encodeURIComponent(primaryFont)}/${range}` };
            }
          } catch (e) {
            console.warn("Failed to rewrite local glyph URL", e);
          }
        }
        return { url: currentUrl };
      }
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
        if (map) {
          map.remove();
        }
      }
    };
    };

    if (typeof styleUrl === 'string') {
      if (styleUrl.startsWith('solid:')) {
        initMap({
          version: 8,
          sources: {},
          layers: [{ id: 'solid-bg-layer', type: 'background', paint: { 'background-color': styleUrl.replace('solid:', '') } }]
        });
      } else {
        fetch(styleUrl).then(res => res.json()).then(json => {
          const mockSettings = settings || { replaceGothamFont: true };
          initMap(applyMapFontOverridesToStyleJson(json, mockSettings));
        }).catch(() => initMap(styleUrl));
      }
    } else {
      const mockSettings = settings || { replaceGothamFont: true };
      initMap(applyMapFontOverridesToStyleJson(JSON.parse(JSON.stringify(styleUrl)), mockSettings));
    }
  }, [styleUrl, onReady, settings]);

  return (
    <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '256px', height: '256px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
