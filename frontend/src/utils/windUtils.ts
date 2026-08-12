export type WindPoint = { id: string; lat: number; lon: number };

export const buildWindPoints = (): WindPoint[] => {
  const points: WindPoint[] = [];
  const seen = new Set<string>();

  const addPoint = (id: string, lat: number, lon: number) => {
    const key = `${lat},${lon}`;
    if (seen.has(key)) return;
    seen.add(key);
    points.push({ id, lat, lon });
  };

  const addGrid = (prefix: string, latStart: number, latEnd: number, latStep: number, lonStart: number, lonEnd: number, lonStep: number) => {
    for (let lat = latStart; lat <= latEnd; lat += latStep) {
      for (let lon = lonStart; lon <= lonEnd; lon += lonStep) {
        addPoint(`${prefix}-${lat}-${lon}`, lat, lon);
      }
    }
  };

  addGrid('global', -60, 70, 10, -180, 170, 10);
  addGrid('southern-ocean', -60, -35, 5, -180, 175, 5);
  addGrid('north-atlantic', 35, 70, 5, -80, 30, 5);
  addGrid('north-pacific-west', 30, 65, 5, 120, 180, 5);
  addGrid('north-pacific-east', 30, 65, 5, -180, -120, 5);
  addGrid('west-pacific-typhoon', 0, 35, 5, 100, 180, 5);
  addGrid('atlantic-hurricane', 5, 35, 5, -100, -10, 5);
  addGrid('europe', 34, 62, 2, -12, 32, 2);

  for (let lat = 47; lat <= 55; lat += 1) {
    for (let lon = 6; lon <= 15; lon += 1) {
      addPoint(`germany-${lat}-${lon}`, lat, lon);
    }
  }

  return points;
};

export const WIND_POINTS = buildWindPoints();
export const WIND_BATCH_SIZE = 300;
export const WIND_BATCH_DELAY_MS = 1000;
export const WIND_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const WIND_MIN_OPEN_REFRESH_DELAY_MS = 30 * 60 * 1000;
