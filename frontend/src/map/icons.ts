import maplibregl from 'maplibre-gl';

export const loadDefaultMapIcons = (map: maplibregl.Map) => {
      // Add Icons for Flights Layer
      const loadIcon = (name: string, svg: string) => {
        const img = new Image();
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        img.onload = () => {
          if (!map.hasImage(name)) map.addImage(name, img, { sdf: true });
        };
      };

      loadIcon('airplane', `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="#ffffff" stroke="none">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
        </svg>
      `);

      loadIcon('helicopter', `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">
          <ellipse cx="12" cy="14" rx="2.5" ry="5" fill="#ffffff" />
          <rect x="11.5" y="18" width="1" height="5" fill="#ffffff" />
          <rect x="9" y="21" width="6" height="1.5" fill="#ffffff" />
          <circle cx="12" cy="14" r="8" fill="none" stroke="#ffffff" stroke-width="0.5" />
          <path d="M4 14 L20 14 M12 6 L12 22" stroke="#ffffff" stroke-width="1.2" />
        </svg>
      `);

      loadIcon('small_aircraft', `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">
          <ellipse cx="12" cy="12" rx="2" ry="8" fill="#ffffff" />
          <rect x="3" y="8" width="18" height="2.5" fill="#ffffff" rx="1" />
          <rect x="8" y="18" width="8" height="2" fill="#ffffff" rx="0.5" />
        </svg>
      `);

      loadIcon('military', `
        <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24">
          <path d="M12 2 L14 12 L22 16 L22 18 L13 16 L12 21 L11 16 L2 18 L2 16 L10 12 Z" fill="#ffffff" />
        </svg>
      `);

      // Add Icons for Vessels Layer
      loadIcon('ship-fast', `
        <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="#ffffff" />
        </svg>
      `);
      loadIcon('ship-slow', `
        <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="#ffffff" />
        </svg>
      `);
      loadIcon('ship-still', `
        <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 28 28">
          <path d="M14 1 L25 25 L14 19 L3 25 Z" fill="none" stroke="#ffffff" stroke-width="1.5" />
        </svg>
      `);
      loadIcon('wind-arrow', `
        <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 28 28">
          <path d="M14 2 L24 24 L14 18 L4 24 Z" fill="#ffffff" />
        </svg>
      `);


};
