import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';

interface UseWindAnimationProps {
  map: maplibregl.Map | null;
  canvas: HTMLCanvasElement | null;
  mapLoaded?: boolean;
  settings: any;
  windGeojson: GeoJSON.FeatureCollection<GeoJSON.Point> | null;
  isSecondary?: boolean;
  selectedWeatherTime: string | null;
}

export const useWindAnimation = ({
  map,
  canvas,
  mapLoaded,
  settings,
  windGeojson,
  isSecondary,
  selectedWeatherTime,
}: UseWindAnimationProps) => {
  useEffect(() => {
    const windLayer = settings.layers.find((l: any) => l.type === 'weather_forecast');
    if (!map || !canvas || !mapLoaded || !windLayer?.visible || !windGeojson || isSecondary) return;
    if (windLayer.showWindParticles === false) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentSelectedTime = selectedWeatherTime;

    const vectors = windGeojson.features
      .map(feature => {
        const [lon, lat] = feature.geometry.coordinates;
        
        let times = feature.properties?.dailyTime || [];
        if (typeof times === 'string') {
          try { times = JSON.parse(times); } catch (e) { times = []; }
        }
        
        let timeIndex = 0;
        if (currentSelectedTime) {
           const targetDate = currentSelectedTime.substring(0, 10);
           const foundIdx = times.findIndex((t: string) => t.startsWith(targetDate));
           if (foundIdx !== -1) timeIndex = foundIdx;
        }

        let speeds = feature.properties?.windSpeedDaily;
        if (!speeds) speeds = [feature.properties?.windSpeed ?? 0];
        else if (typeof speeds === 'string') {
          try { speeds = JSON.parse(speeds); } catch (e) { speeds = [feature.properties?.windSpeed ?? 0]; }
        }
        
        let gusts = feature.properties?.windGustDaily;
        if (!gusts) gusts = [feature.properties?.windGust ?? speeds[timeIndex] ?? 0];
        else if (typeof gusts === 'string') {
          try { gusts = JSON.parse(gusts); } catch (e) { gusts = [feature.properties?.windGust ?? speeds[timeIndex] ?? 0]; }
        }
        
        let directions = feature.properties?.windDirectionDaily;
        if (!directions) directions = [feature.properties?.arrowRotation ?? 0];
        else if (typeof directions === 'string') {
          try { directions = JSON.parse(directions); } catch (e) { directions = [feature.properties?.arrowRotation ?? 0]; }
        }

        const speed = Number(speeds[timeIndex] ?? speeds[0] ?? 0);
        const gust = Number(gusts[timeIndex] ?? gusts[0] ?? 0);
        const intensity = Math.max(speed, gust * 0.78);
        const rotation = Number(directions[timeIndex] ?? directions[0] ?? 0);
        const arrowRotation = (rotation + 180) % 360;
        const radians = arrowRotation * Math.PI / 180;
        return {
          lon,
          lat,
          speed,
          gust,
          intensity,
          u: Math.sin(radians) * intensity,
          v: Math.cos(radians) * intensity
        };
      })
      .filter(vector => Number.isFinite(vector.lon) && Number.isFinite(vector.lat));

    if (vectors.length === 0) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let particles: Array<{ lon: number; lat: number; age: number; maxAge: number }> = [];
    const particleCount = 3400;
    const particleSize = windLayer.windParticleSize ?? 1.5;
    const trailLength = windLayer.windParticleTrail ?? 90;
    const baseTrailAlpha = 0.68 + (Math.max(0, Math.min(100, trailLength)) / 100) * 0.27;
    const maxWindSpeed = Math.max(1, ...vectors.map(vector => vector.intensity));

    const getWindColor = (speed: number) => {
      if (speed < 8) return '#334155';
      if (speed < 18) return '#2563eb';
      if (speed < 30) return '#22d3ee';
      if (speed < 45) return '#4ade80';
      if (speed < 60) return '#facc15';
      if (speed < 80) return '#f97316';
      if (speed < 105) return '#ef4444';
      if (speed < 130) return '#a855f7';
      return '#ffffff';
    };

    const resize = () => {
      const rect = map.getCanvas().getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const resetParticle = () => {
      const lngLat = map.unproject([Math.random() * width, Math.random() * height]);
      return {
        lon: lngLat.lng,
        lat: lngLat.lat,
        age: Math.floor(Math.random() * 120),
        maxAge: 140 + Math.floor(Math.random() * 100)
      };
    };

    const interpolatedVector = (lon: number, lat: number) => {
      const latScale = Math.max(0.25, Math.cos(lat * Math.PI / 180));
      let weightedU = 0;
      let weightedV = 0;
      let totalWeight = 0;
      let nearest = vectors[0];
      let nearestDistance = Infinity;

      for (const vector of vectors) {
        const dx = (vector.lon - lon) * latScale;
        const dy = vector.lat - lat;
        const distance = dx * dx + dy * dy;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = vector;
        }

        const weight = 1 / Math.max(distance, 0.12);
        weightedU += vector.u * weight;
        weightedV += vector.v * weight;
        totalWeight += weight;
      }

      if (totalWeight <= 0) return nearest;
      const u = weightedU / totalWeight;
      const v = weightedV / totalWeight;
      return {
        u,
        v,
        speed: Math.hypot(u, v),
        gust: Math.hypot(u, v),
        intensity: Math.hypot(u, v)
      };
    };

    const draw = () => {
      if (!map) return;
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - baseTrailAlpha})`;
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = particleSize;

      const zoom = map.getZoom();
      const zoomScale = Math.pow(2, zoom - 4);
      const stepSize = 0.04 / zoomScale;

      particles = particles.map(particle => {
        if (particle.age >= particle.maxAge) return resetParticle();
        particle.age++;
        const vector = interpolatedVector(particle.lon, particle.lat);
        if (!vector) return resetParticle();
        
        const latScale = Math.max(0.25, Math.cos(particle.lat * Math.PI / 180));
        const nextLon = particle.lon + (vector.u * stepSize) / latScale;
        const nextLat = particle.lat + vector.v * stepSize;

        const point = map.project([particle.lon, particle.lat]);
        const tailPoint = map.project([nextLon, nextLat]);

        if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
          return resetParticle();
        }

        const speedRatio = Math.min(1, vector.intensity / Math.max(60, maxWindSpeed));
        const fade = 1 - (particle.age / particle.maxAge);
        const alpha = Math.min(0.9, (0.3 + (speedRatio * 0.6)) * fade);

        ctx.strokeStyle = getWindColor(vector.intensity) + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(tailPoint.x, tailPoint.y);
        ctx.stroke();

        return { ...particle, lon: nextLon, lat: nextLat };
      });

      frame = requestAnimationFrame(draw);
    };

    const handleResize = () => {
      resize();
      particles = Array.from({ length: particleCount }, resetParticle);
    };

    const clearTrail = () => {
      ctx.clearRect(0, 0, width, height);
    };

    const refreshParticles = () => {
      clearTrail();
      particles = Array.from({ length: particleCount }, resetParticle);
    };

    map.on('resize', handleResize);
    map.on('movestart', clearTrail);
    map.on('zoomstart', clearTrail);
    map.on('rotatestart', clearTrail);
    map.on('pitchstart', clearTrail);
    map.on('moveend', refreshParticles);
    map.on('zoomend', refreshParticles);
    map.on('rotateend', refreshParticles);
    map.on('pitchend', refreshParticles);
    draw();

    return () => {
      cancelAnimationFrame(frame);
      map.off('resize', handleResize);
      map.off('movestart', clearTrail);
      map.off('zoomstart', clearTrail);
      map.off('rotatestart', clearTrail);
      map.off('pitchstart', clearTrail);
      map.off('moveend', refreshParticles);
      map.off('zoomend', refreshParticles);
      map.off('rotateend', refreshParticles);
      map.off('pitchend', refreshParticles);
      ctx.clearRect(0, 0, width, height);
    };
  }, [settings.layers, mapLoaded, windGeojson, isSecondary, selectedWeatherTime, map, canvas]);
};
