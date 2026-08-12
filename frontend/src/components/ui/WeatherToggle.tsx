import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../contexts/I18nContext';
import type { MapLayer, AppSettings } from '../../types';

interface WeatherToggleProps {
  weatherToggleRef: React.RefObject<HTMLDivElement | null>;
  activeWeatherLayer: MapLayer | undefined;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  uiBottomPadding?: number;
}

export const WeatherToggle: React.FC<WeatherToggleProps> = ({
  weatherToggleRef,
  activeWeatherLayer,
  setSettings,
  uiBottomPadding = 0
}) => {
  const { t } = useTranslation();

  if (!activeWeatherLayer) return null;

  return (
    <div 
      ref={weatherToggleRef}
      className="absolute z-30 flex items-center justify-center pointer-events-none transition-all duration-300 ease-in-out"
      style={{ bottom: `${24 + uiBottomPadding}px` }}
    >
      <div className="flex border border-white/20 rounded-full p-1 relative bg-black shadow-xl shrink-0 pointer-events-auto">
        <button
          onClick={() => {
            setSettings(prev => ({
              ...prev,
              layers: prev.layers.map(l => l.id === activeWeatherLayer.id ? { ...l, showTemperature: true, showPrecipitation: false } : l)
            }));
          }}
          className={`px-4 py-2 text-sm relative z-10 transition-colors whitespace-nowrap rounded-full ${activeWeatherLayer?.showTemperature ? 'text-black' : 'text-white/60 hover:text-white/80'}`}
        >
          {activeWeatherLayer?.showTemperature && (
            <motion.div
              layoutId="weather-type-active-bg-map"
              className="absolute inset-0 bg-white rounded-full -z-10"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          {t("Temperature")}
        </button>
        <button
          onClick={() => {
            setSettings(prev => ({
              ...prev,
              layers: prev.layers.map(l => l.id === activeWeatherLayer.id ? { ...l, showTemperature: false, showPrecipitation: true } : l)
            }));
          }}
          className={`px-4 py-2 text-sm relative z-10 transition-colors whitespace-nowrap rounded-full ${activeWeatherLayer?.showPrecipitation ? 'text-black' : 'text-white/60 hover:text-white/80'}`}
        >
          {activeWeatherLayer?.showPrecipitation && (
            <motion.div
              layoutId="weather-type-active-bg-map"
              className="absolute inset-0 bg-white rounded-full -z-10"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          {t("Precipitation")}
        </button>
      </div>
    </div>
  );
};
