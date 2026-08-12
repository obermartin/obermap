import { useState, useEffect } from 'react';
import type { AppSettings } from '../../types';

export const useVolcanoAlerts = (
  settings: AppSettings
) => {
  const selectedVolcano = settings.layers.find(l => l.type === 'gdacs_volcanoes')?.selectedFeatureData || null;
  const [selectedVolcanoPolygon, setSelectedVolcanoPolygon] = useState<any>(null);

  // Fetch danger zone polygon when selectedVolcano changes
  useEffect(() => {
    if (!selectedVolcano) {
      setSelectedVolcanoPolygon(null);
      window.dispatchEvent(new CustomEvent('exportDataReady', {
        detail: { type: 'gdacs_volcanoes', id: undefined, ready: false }
      }));
      return;
    }

    let isSubscribed = true;
    window.dispatchEvent(new CustomEvent('exportDataReady', {
      detail: { type: 'gdacs_volcanoes', id: selectedVolcano.id, ready: false }
    }));

    (async () => {
      try {
        const url = selectedVolcano.geomUrl.replace('http:', 'https:');
        const polyRes = await fetch(url);
        if (!polyRes.ok) throw new Error('Failed to fetch volcano polygon');
        const polyData = await polyRes.json();
        if (isSubscribed) {
          setSelectedVolcanoPolygon(polyData);
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'gdacs_volcanoes', id: selectedVolcano.id, ready: true, data: polyData }
          }));
        }
      } catch (err) {
        console.error('Error in volcano polygon logic:', err);
        if (isSubscribed) {
          setSelectedVolcanoPolygon(null);
          window.dispatchEvent(new CustomEvent('exportDataReady', {
            detail: { type: 'gdacs_volcanoes', id: selectedVolcano.id, ready: 'empty' }
          }));
        }
      }
    })();

    return () => { isSubscribed = false; };
  }, [selectedVolcano]);

  return {
    selectedVolcano,
    selectedVolcanoPolygon,
  };
};
