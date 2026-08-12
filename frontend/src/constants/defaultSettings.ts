import type { AppSettings } from '../types';
import { DEFAULT_ICON_CATEGORIES } from '../defaultIcons';

export const DEFAULT_SETTINGS: AppSettings = {
  mapStyle: 'https://tiles.openfreemap.org/styles/liberty',
  projection: 'mercator',
  defaultView: {
    center: [10.45, 51.16],
    zoom: 5,
    pitch: 45,
    bearing: 0
  },
  exportBasemapScale: 1,
  exportAnnotationScale: 1,
  exportScalePreview: false,
  uiBottomPadding: 0,
  uiTheme: 'dark',
  uiLiquidGlass: false,
  colorPalette: ['#DD0000', '#F15A38', '#F9A03F', '#F8DE22', '#8CC63F', '#009245', '#00A79D', '#27AAE1', '#2B3990', '#662D91', '#9E1F63'],
  icons: DEFAULT_ICON_CATEGORIES,
  labelDensity: 50,
  replaceGothamFont: true,
  globalDateMode: 'single',
  globalStartDate: 'today',
  globalEndDate: 'today',
  layers: [
    { id: 'split-container', name: 'Split View Container', type: 'split', visible: false, splitPosition: 0.5, splitDirection: 'vertical', splitLayers: [] },
    { id: 'deepstate', name: 'Ukraine', type: 'deepstate', visible: false, isLive: true },
    { id: 'flights', name: 'Air Traffic', type: 'flights', visible: false, showCallsigns: true },
    { id: 'vessels', name: 'Maritime Traffic', type: 'vessels', visible: false },
    { id: 'nighttime', name: 'Nighttime Overlay', type: 'nighttime', visible: false, opacity: 0.5 },
    { id: 'satellite', name: 'Satellite View (Bing)', type: 'satellite', visible: false },
    { id: 'population_density', name: 'Population Density', type: 'raster', visible: false, url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png' },
    { id: 'weather_forecast', name: 'Weather', type: 'weather_forecast', visible: false, showTemperature: true, showPrecipitation: false, windOpacity: 1, windParticleSize: 1.5, windParticleTrail: 94, showWindParticles: true, showWindLegend: true, windParticleSizeBySpeed: true, windParticleSpeedBySpeed: true, windParticleTrailBySpeed: false, windParticleColorBySpeed: false, showCityTemperatures: true, showCityWeatherIcons: true },
    { id: 'gdacs_cyclones', name: 'Tropical Cyclones', type: 'gdacs_cyclones', visible: false },
    { id: 'wildfires', name: 'Wildfires', type: 'wildfires', visible: false, url: 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetMap&layers=nrt.ba&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}/{date-end}' },
    { id: 'floods', name: 'Floods', type: 'raster', visible: false, url: 'https://geoserver.gfm.eodc.eu/geoserver/gfm/wms?service=WMS&request=GetMap&layers=observed_flood_extent&version=1.1.1&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&styles=&bbox={bbox-epsg-3857}&time={date-start}T00:00:00.000Z/{date-end}T23:59:59.000Z' },
    { id: 'gdacs_earthquakes', name: 'Earthquakes', type: 'gdacs_earthquakes', visible: false },
    { id: 'gdacs_volcanoes', name: 'Volcanoes', type: 'gdacs_volcanoes', visible: false }
  ]
};
