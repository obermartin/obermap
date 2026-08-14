declare module 'mgrs' {
  /**
   * Convert WGS84 coordinates to MGRS string.
   * @param ll [lon, lat]
   * @param accuracy 1 to 5 (10km, 1km, 100m, 10m, 1m)
   * @returns MGRS string
   */
  export function forward(ll: [number, number], accuracy?: number): string;
  
  /**
   * Convert MGRS string to WGS84 coordinates.
   * @param mgrs MGRS string
   * @returns [lon, lat]
   */
  export function inverse(mgrs: string): [number, number];
  
  /**
   * Convert MGRS string to bounding box.
   * @param mgrs MGRS string
   * @returns [left, bottom, right, top]
   */
  export function toPoint(mgrs: string): [number, number, number, number];
}
