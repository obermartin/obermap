const fs = require('fs');
let code = fs.readFileSync('src/components/MapContainer.tsx', 'utf8');

// Fix flyTo calls
code = code.replace(/mapRef\.current\.flyTo\(\{\s+center:\s+(.+?\.center),\s+zoom:\s+\1\.zoom,\s+pitch:\s+\1\.pitch,\s+bearing:\s+\1\.bearing,\s+\.\.\.\(\1\.elevation !== undefined \? \{ elevation: \1\.elevation, centerClampedToGround: false \} : \{\}\),/g, 'mapRef.current.flyTo({\n          center: $1.center,\n          zoom: $1.zoom,\n          pitch: $1.pitch,\n          bearing: $1.bearing,');

code = code.replace(/map1!\.flyTo\(\{\s+center:\s+(.+?\.center),\s+zoom:\s+\1\.zoom,\s+pitch:\s+\1\.pitch,\s+bearing:\s+\1\.bearing,\s+\.\.\.\(\1\.elevation !== undefined \? \{ elevation: \1\.elevation, centerClampedToGround: false \} : \{\},/g, 'map1!.flyTo({\n              center: $1.center,\n              zoom: $1.zoom,\n              pitch: $1.pitch,\n              bearing: $1.bearing,');
code = code.replace(/map1!\.flyTo\(\{\s+center:\s+(.+?\.center),\s+zoom:\s+\1\.zoom,\s+pitch:\s+\1\.pitch,\s+bearing:\s+\1\.bearing,\s+\.\.\.\(\1\.elevation !== undefined \? \{ elevation: \1\.elevation, centerClampedToGround: false \} : \{\}\),/g, 'map1!.flyTo({\n              center: $1.center,\n              zoom: $1.zoom,\n              pitch: $1.pitch,\n              bearing: $1.bearing,');

// Fix jumpTo calls
code = code.replace(/\.\.\.\((.+?)\.elevation !== undefined \? \{ elevation: \1\.elevation, centerClampedToGround: false \} : \{\}\)/g, '...($1.elevation !== undefined ? { elevation: $1.elevation } : {})');

// Fix idle listeners for mapRef.current
code = code.replace(/if \((.+?)\.elevation !== undefined\) \{\s+mapRef\.current\.once\('idle', \(\) => \{\s+mapRef\.current\?\.setCenterClampedToGround\(true\);\s+\}\);\s+\}/g, `if ($1.elevation !== undefined) {
          mapRef.current.once('idle', () => {
            mapRef.current?.jumpTo({
              center: $1.center,
              zoom: $1.zoom,
              pitch: $1.pitch,
              bearing: $1.bearing,
              elevation: $1.elevation
            });
          });
        }`);

// Fix idle listeners for map1!
code = code.replace(/if \((.+?)\.elevation !== undefined\) \{\s+map1!\.once\('idle', \(\) => map1!\.setCenterClampedToGround\(true\)\);\s+\}/g, `if ($1.elevation !== undefined) {
          map1!.once('idle', () => {
            map1!.jumpTo({
              center: $1.center,
              zoom: $1.zoom,
              pitch: $1.pitch,
              bearing: $1.bearing,
              elevation: $1.elevation
            });
          });
        }`);

// Remove the default settings idle listener
code = code.replace(/if \(settings\.defaultView\.elevation !== undefined\) \{\s+map\.once\('idle', \(\) => map\.setCenterClampedToGround\(true\)\);\s+\}/g, '');

fs.writeFileSync('src/components/MapContainer.tsx', code);
