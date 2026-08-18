import maplibregl from 'maplibre-gl';
import type { AppSettings } from '../types';
import excludedCitiesData from '../assets/excluded-cities.json';

export const applyMapFontOverrides = (
  map: maplibregl.Map,
  settings: AppSettings,
  originalFiltersRef: React.MutableRefObject<{ [layerId: string]: any }>
) => {
      // Find first symbol layer to render deepstate below labels
      const styleLayers = map.getStyle().layers || [];
      let firstSymbolId: string | undefined;
      let initFirstAdminId: string | undefined;
      for (let i = 0; i < styleLayers.length; i++) {
        const id = styleLayers[i].id;
        if (!initFirstAdminId && 
            (styleLayers[i].type === 'line' || styleLayers[i].type === 'symbol') &&
            !id.includes('water') && !id.includes('marine') &&
            (id.includes('admin') || id.includes('border') || id.includes('boundar') || id.includes('country'))) {
          initFirstAdminId = id;
        }
        if (styleLayers[i].type === 'symbol') {
          if (!firstSymbolId) firstSymbolId = id;
          if (!id.startsWith('custom-')) {
            originalFiltersRef.current[id] = map.getFilter(id) || null;
            
            if (id.includes('place') || id.includes('city') || id.includes('town') || id.includes('village') || id.includes('capital')) {
              try {
                const layout = (styleLayers[i] as any).layout;
                if (layout && layout['icon-image']) {
                  const existingSize = layout['icon-size'];
                  // If icon-size is missing, invalid (e.g. string), or >= 1, force a sane default
                  const needsScaleDown = existingSize === undefined || 
                                         (typeof existingSize !== 'number' && !Array.isArray(existingSize)) || 
                                         (typeof existingSize === 'number' && existingSize >= 1);
                                         
                  if (needsScaleDown) {
                    map.setLayoutProperty(id, 'icon-size', 0.2);
                  }
                }
              } catch(e) {}
            }
            
            // Apply language overrides
            const layout = (styleLayers[i] as any).layout;
            if (layout && layout['text-field']) {
              // Ensure we don't accidentally overwrite icon-only layers that don't have text
              if (typeof layout['text-field'] === 'string' || Array.isArray(layout['text-field'])) {
                
                const originalTextStr = JSON.stringify(layout['text-field']).toLowerCase();
                
                if (originalTextStr.includes('name')) {
                  const isCountry = id.toLowerCase().includes('country') || id.toLowerCase().includes('admin-0');
                  
                  // Add any other historically sensitive German names to src/assets/excluded-cities.json
                  const excludedCities = excludedCitiesData;

                  let textFieldExp: any[];
                  
                  if (isCountry) {
                    textFieldExp = [
                      'coalesce', ['get', 'name:de'], ['get', 'name:latin'], layout['text-field']
                    ];
                  } else {
                    textFieldExp = [
                      'case',
                      ['in', ['coalesce', ['get', 'name:de'], ''], ['literal', excludedCities]],
                      ['coalesce', ['get', 'name:latin'], layout['text-field']],
                      
                      ['coalesce', ['get', 'name:de'], ['get', 'name:latin'], layout['text-field']]
                    ];
                  }

                  map.setLayoutProperty(id, 'text-field', textFieldExp);
                }
                
                if (settings.replaceGothamFont !== false) {
                  // Map font weights dynamically based on layer type
                  let newFont = 'Gotham Condensed Book';
                  const lowerId = id.toLowerCase();
                  
                  if (lowerId.includes('country') || lowerId.includes('admin-0')) {
                    newFont = 'Gotham Condensed Bold';
                  } else if (lowerId.includes('state') || lowerId.includes('admin-1')) {
                    newFont = 'Gotham Condensed Medium';
                  } else if (lowerId.includes('water') || lowerId.includes('marine') || lowerId.includes('ocean')) {
                    newFont = 'Gotham Condensed Book Italic';
                  } else if (lowerId.includes('city') || lowerId.includes('town')) {
                    newFont = 'Gotham Condensed Medium';
                  } else if (lowerId.includes('road') || lowerId.includes('street') || lowerId.includes('path')) {
                    newFont = 'Gotham Condensed Light';
                  } else {
                    // Attempt to preserve original weight if possible
                    try {
                      const currentFonts = JSON.stringify(layout['text-font']).toLowerCase();
                      if (currentFonts.includes('black') || currentFonts.includes('heavy')) newFont = 'Gotham Condensed Black';
                      else if (currentFonts.includes('bold') || currentFonts.includes('strong')) newFont = 'Gotham Condensed Bold';
                      else if (currentFonts.includes('medium')) newFont = 'Gotham Condensed Medium';
                      else if (currentFonts.includes('light') || currentFonts.includes('thin')) newFont = 'Gotham Condensed Light';
                      
                      if (currentFonts.includes('italic')) newFont += ' Italic';
                    } catch (e) {
                      // Fallback to book
                    }
                  }
                  
                  map.setLayoutProperty(id, 'text-font', [newFont]);
                }
              }
            }
          }
        }
      }


  return { firstSymbolId, initFirstAdminId };
};

export const applyMapFontOverridesToStyleJson = (
  style: any,
  settings: AppSettings
) => {
  if (settings.replaceGothamFont === false) return style;
  if (!style || !style.layers) return style;

  const newStyle = JSON.parse(JSON.stringify(style));
  
  for (let i = 0; i < newStyle.layers.length; i++) {
    const layer = newStyle.layers[i];
    const id = layer.id;
    if (layer.type === 'symbol' && !id.startsWith('custom-')) {
      if (layer.layout && layer.layout['text-field']) {
        if (typeof layer.layout['text-field'] === 'string' || Array.isArray(layer.layout['text-field'])) {
          let newFont = 'Gotham Condensed Book';
          const lowerId = id.toLowerCase();
          
          if (lowerId.includes('country') || lowerId.includes('admin-0')) {
            newFont = 'Gotham Condensed Bold';
          } else if (lowerId.includes('state') || lowerId.includes('admin-1')) {
            newFont = 'Gotham Condensed Medium';
          } else if (lowerId.includes('water') || lowerId.includes('marine') || lowerId.includes('ocean')) {
            newFont = 'Gotham Condensed Book Italic';
          } else if (lowerId.includes('city') || lowerId.includes('town')) {
            newFont = 'Gotham Condensed Medium';
          } else if (lowerId.includes('road') || lowerId.includes('street') || lowerId.includes('path')) {
            newFont = 'Gotham Condensed Light';
          } else {
            try {
              const currentFonts = JSON.stringify(layer.layout['text-font']).toLowerCase();
              if (currentFonts.includes('black') || currentFonts.includes('heavy')) newFont = 'Gotham Condensed Black';
              else if (currentFonts.includes('bold') || currentFonts.includes('strong')) newFont = 'Gotham Condensed Bold';
              else if (currentFonts.includes('medium')) newFont = 'Gotham Condensed Medium';
              else if (currentFonts.includes('light') || currentFonts.includes('thin')) newFont = 'Gotham Condensed Light';
              
              if (currentFonts.includes('italic')) newFont += ' Italic';
            } catch (e) {}
          }
          layer.layout['text-font'] = [newFont];
        }
      }
    }
  }
  return newStyle;
};
