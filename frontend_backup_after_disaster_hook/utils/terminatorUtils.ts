export function getTerminatorPolygon(date: Date) {
    const PI = Math.PI;
    const sin = Math.sin;
    const cos = Math.cos;
    const asin = Math.asin;
    const atan2 = Math.atan2;
    const atan = Math.atan;
    const tan = Math.tan;

    const rad = PI / 180;
    const deg = 180 / PI;
    const dayMs = 1000 * 60 * 60 * 24;
    const J1970 = 2440588;
    const J2000 = 2451545;

    const d = date.valueOf() / dayMs - 0.5 + J1970 - J2000;

    const M = rad * (357.5291 + 0.98560028 * d);
    const C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M));
    const L = M + C + rad * 102.9372 + PI;
    
    // declination
    const declination = asin(sin(L) * sin(rad * 23.4397));
    
    // right ascension
    const rightAscension = atan2(sin(L) * cos(rad * 23.4397), cos(L));
    
    // greenwich mean sidereal time
    let gmst = 280.46061837 + 360.98564736629 * d;
    gmst = gmst % 360;
    if (gmst < 0) gmst += 360;
    
    // hour angle
    const hourAngle = (rad * gmst) - rightAscension;
    const subsolarLng = -hourAngle;

    const coords: [number, number][] = [];
    const step = 1; // 1 degree step

    // Calculate terminator line
    for (let lng = -180; lng <= 180; lng += step) {
        const lngRad = lng * rad;
        let latRad;
        
        // Handle equinox edge case
        if (Math.abs(declination) < 0.0001) {
            // At equinox, the terminator is practically on the poles, 
            // but for rendering purposes we just calculate a slight offset
            latRad = atan(-cos(lngRad - subsolarLng) / tan(0.0001));
        } else {
            latRad = atan(-cos(lngRad - subsolarLng) / tan(declination));
        }
        
        let lat = latRad * deg;
        // Mapbox GL can struggle with exact 90/-90
        lat = Math.max(-89.9, Math.min(89.9, lat));
        coords.push([lng, lat]);
    }

    // Close the polygon by wrapping around the appropriate pole
    if (declination > 0) {
        // Northern summer -> Night covers South Pole
        coords.push([180, -89.9]);
        coords.push([-180, -89.9]);
    } else {
        // Southern summer -> Night covers North Pole
        coords.push([180, 89.9]);
        coords.push([-180, 89.9]);
    }
    coords.push(coords[0]); // Close the ring

    return {
        type: "FeatureCollection" as const,
        features: [{
            type: "Feature" as const,
            properties: {},
            geometry: {
                type: "Polygon" as const,
                coordinates: [coords]
            }
        }]
    };
}
