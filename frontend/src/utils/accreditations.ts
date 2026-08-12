import type { MapLayer } from '../types';

const PRESET_ACCREDITATIONS: Record<string, { en: string; de: string; source: string }> = {
  deepstate: { en: "Ukraine War", de: "Ukrainekrieg", source: "Deepstatemap" },
  flights: { en: "Air Traffic", de: "Flugverkehr", source: "OpenSky Network" },
  vessels: { en: "Maritime Traffic", de: "Schiffsverkehr", source: "AISStream" },
  satellite: { en: "Satellite view", de: "Satellitenansicht", source: "Bing" },
  bing_satellite: { en: "Satellite view", de: "Satellitenansicht", source: "Bing" },
  population_density: { en: "Population Density", de: "Bevölkerungsdichte", source: "NASA" },
  weather_forecast: { en: "Weather", de: "Wetter", source: "Open-Meteo" },
  floods: { en: "Floods", de: "Überschwemmungen", source: "Copernicus/GloFAS" },
  copernicus: { en: "Wildfires", de: "Waldbrände", source: "Copernicus/EFFIS" },
  wildfires: { en: "Wildfires", de: "Waldbrände", source: "Copernicus/EFFIS" },
  gdacs_earthquakes: { en: "Earthquakes", de: "Erdbeben", source: "Global Disaster Alert and Coordination System (GDACS)" },
  gdacs_volcanoes: { en: "Volcanic Eruptions", de: "Vulkanausbrüche", source: "Global Disaster Alert and Coordination System (GDACS)" },
  gdacs_cyclones: { en: "Tropical Storms", de: "Tropische Stürme", source: "Global Disaster Alert and Coordination System (GDACS)" },
};

export const getAccreditations = (layers: MapLayer[], language: string) => {
  const sources: { identifier: string; source: string }[] = [];
  
  layers.forEach(layer => {
    if (!layer.visible) return;
    if (layer.type === 'split' || layer.type === 'nighttime') return;
    
    let identifier = '';
    let source = '';

    if (layer.dataSource) {
      identifier = layer.name;
      source = layer.dataSource;
    } else {
      const preset = PRESET_ACCREDITATIONS[layer.id] || PRESET_ACCREDITATIONS[layer.type];
      if (preset) {
        identifier = language === 'de' ? preset.de : preset.en;
        source = preset.source;
      }
    }

    if (layer.type === 'gdacs_earthquakes') {
      if (layer.copernicusEnabled) {
        source += ", Copernicus EMS";
      }
      if (layer.usgsDyfi10kmEnabled || layer.usgsDyfi1kmEnabled || layer.usgsLandslideEnabled || layer.usgsLiquefactionEnabled) {
        source += ", USGS";
      }
    }

    if (identifier && source) {
      sources.push({ identifier, source });
    }
  });

  sources.push({
    identifier: language === 'de' ? "BASISKARTE" : "BASE MAP",
    source: "OpenFreeMap, OpenStreetMap"
  });

  const uniqueSources: { identifier: string; source: string }[] = [];
  const seenSources = new Set<string>();

  for (const item of sources) {
    if (!seenSources.has(item.source)) {
      seenSources.add(item.source);
      uniqueSources.push(item);
    }
  }

  return uniqueSources;
};
