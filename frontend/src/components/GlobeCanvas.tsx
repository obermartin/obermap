import { useEffect, useRef } from 'react';

interface Point3D {
  x: number;
  y: number;
  z: number;
}

export function GlobeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    const points: Point3D[] = [];
    
    // Generate graticules (latitude and longitude grid)
    const numLatitudes = 18; // 10 degree steps
    const numLongitudes = 36; // 10 degree steps
    const pointsPerLine = 120; // Density of points along each line

    // Parallels (Lines of latitude)
    for (let lat = 1; lat < numLatitudes; lat++) {
      const phi = (lat / numLatitudes) * Math.PI; // 0 to PI
      for (let i = 0; i < pointsPerLine; i++) {
        const theta = (i / pointsPerLine) * Math.PI * 2;
        points.push({
          x: Math.sin(phi) * Math.cos(theta),
          y: Math.cos(phi),
          z: Math.sin(phi) * Math.sin(theta)
        });
      }
    }

    // Meridians (Lines of longitude)
    for (let lon = 0; lon < numLongitudes; lon++) {
      const theta = (lon / numLongitudes) * Math.PI * 2;
      for (let i = 1; i < pointsPerLine; i++) {
        const phi = (i / pointsPerLine) * Math.PI;
        points.push({
          x: Math.sin(phi) * Math.cos(theta),
          y: Math.cos(phi),
          z: Math.sin(phi) * Math.sin(theta)
        });
      }
    }

    let time = 0;

    const render = () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      time += 0.002;

      // Rotation matrixes
      const sinY = Math.sin(time);
      const cosY = Math.cos(time);
      
      const tilt = 0.15; // slight tilt for better horizon curvature
      const sinX = Math.sin(tilt);
      const cosX = Math.cos(tilt);

      // Set radius so the globe appears slightly wider than the screen width
      const radius = width * 0.6;

      for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // Rotate Y
        const rotY_x = p.x * cosY - p.z * sinY;
        const rotY_z = p.z * cosY + p.x * sinY;
        const rotY_y = p.y;

        // Rotate X (tilt)
        const rotX_x = rotY_x;
        const rotX_y = rotY_y * cosX - rotY_z * sinX;
        const rotX_z = rotY_z * cosX + rotY_y * sinX;

        // Move the globe down in 3D space BEFORE perspective projection
        // Since its top is at y = -1, multiplying by radius means top is at -radius.
        // Adding radius shifts the top to y = 0.
        const translatedY = (rotX_y * radius) + radius;

        // Project with perspective
        // Move camera back to accommodate the larger globe and avoid clipping
        const cameraZ = Math.max(2000, radius * 3);
        const zDist = cameraZ + rotX_z * radius;
        
        // Don't draw points behind the camera
        if (zDist < 1) continue;

        const scale = cameraZ / zDist;
        const projX = (width / 2) + (rotX_x * radius * scale);
        // The top of the globe (y=0) will perfectly align with 1/3 of the screen height
        const projY = (height / 3) + (translatedY * scale);

        // Alpha based on depth
        const alpha = Math.max(0.1, Math.min(1, (rotX_z + 1) / 2));
        
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        // Ensure arc radius is valid
        ctx.arc(projX, projY, Math.max(0.1, 1.5 * scale), 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
