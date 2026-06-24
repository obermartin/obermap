import re

with open('src/components/MapContainer.tsx', 'r') as f:
    code = f.read()

# 1. Geocoder crash fix: Wrap updateClipMasks calls in requestAnimationFrame
code = code.replace(
    "source.setData(collection);",
    "requestAnimationFrame(() => source.setData(collection));"
)

# 2. Add elevation to all view captures
# Find `bearing: <something>.getBearing()` that is NOT followed by `elevation:`
code = re.sub(
    r'(bearing:\s+(map(?:\w*\.current!?)?)\.getBearing\(\)\s*)\n\s*\}',
    r'\1,\n            elevation: \2.queryTerrainElevation([center?.lng || 0, center?.lat || 0] as [number, number]) || 0\n          }',
    code
)

# And fix the ones that use map.getCenter() instead of center
code = code.replace(
    "elevation: map.queryTerrainElevation([center?.lng || 0, center?.lat || 0] as [number, number]) || 0\n          }\n        };",
    "elevation: map.queryTerrainElevation([map.getCenter().lng, map.getCenter().lat]) || 0\n          }\n        };"
)
code = code.replace(
    "elevation: map.queryTerrainElevation([center?.lng || 0, center?.lat || 0] as [number, number]) || 0\n          } : undefined",
    "elevation: map.queryTerrainElevation([map.getCenter().lng, map.getCenter().lat]) || 0\n          } : undefined"
)
code = code.replace(
    "elevation: mapRef.current!.queryTerrainElevation([center?.lng || 0, center?.lat || 0] as [number, number]) || 0\n          }\n        }]);",
    "elevation: mapRef.current!.queryTerrainElevation(coords as [number, number]) || 0\n          }\n        }]);"
)

# 3. Geocoder moveend distance check
geocoder_old = """        // Wait for geocoder flight to finish, then update the view
        mapRef.current.once('moveend', () => {
          const event = new CustomEvent('requestViewCaptureForUpdate', { detail: annotationId });
          window.dispatchEvent(event);
        });"""
geocoder_new = """        // Wait for geocoder flight to finish, then update the view
        // Only update if we actually reached the destination (flight wasn't aborted)
        mapRef.current.once('moveend', () => {
          const currentCenter = mapRef.current!.getCenter();
          const dist = Math.sqrt(Math.pow(currentCenter.lng - coords[0], 2) + Math.pow(currentCenter.lat - coords[1], 2));
          if (dist < 0.1) {
            const event = new CustomEvent('requestViewCaptureForUpdate', { detail: annotationId });
            window.dispatchEvent(event);
          }
        });"""
code = code.replace(geocoder_old, geocoder_new)


# 4. Fix jumpTo undefined elevation
code = code.replace(
    "bearing: settings.defaultView.bearing\n            });",
    "bearing: settings.defaultView.bearing,\n              ...(settings.defaultView.elevation !== undefined ? { elevation: settings.defaultView.elevation } : {})\n            });"
)
code = code.replace(
    "bearing: viewsToVisit[0].view.bearing\n        });",
    "bearing: viewsToVisit[0].view.bearing,\n          ...(viewsToVisit[0].view.elevation !== undefined ? { elevation: viewsToVisit[0].view.elevation } : {})\n        });"
)
code = code.replace(
    "bearing: view.bearing\n          });",
    "bearing: view.bearing,\n            ...(view.elevation !== undefined ? { elevation: view.elevation } : {})\n          });"
)
code = code.replace(
    "bearing: firstView.bearing\n        });",
    "bearing: firstView.bearing,\n          ...(firstView.elevation !== undefined ? { elevation: firstView.elevation } : {})\n        });"
)
code = code.replace(
    "bearing: view.bearing\n            });",
    "bearing: view.bearing,\n              ...(view.elevation !== undefined ? { elevation: view.elevation } : {})\n            });"
)


# 5. Fix flyTo ignoring elevation (the MapLibre bug)
flyto_replacement = """        mapRef.current.flyTo({
          center: view.center,
          zoom: view.zoom,
          pitch: view.pitch,
          bearing: view.bearing,
          duration: 2000,
          essential: true
        });

        if (view.elevation !== undefined) {
          mapRef.current.once('idle', () => {
            mapRef.current?.jumpTo({
              center: view.center,
              zoom: view.zoom,
              pitch: view.pitch,
              bearing: view.bearing,
              elevation: view.elevation
            });
          });
        }"""
code = code.replace(
    "mapRef.current.flyTo({\n          center: view.center,\n          zoom: view.zoom,\n          pitch: view.pitch,\n          bearing: view.bearing,\n          duration: 2000,\n          essential: true\n        });",
    flyto_replacement
)

flyto_label_replacement = """        mapRef.current.flyTo({
          center: ann.view.center,
          zoom: ann.view.zoom,
          pitch: ann.view.pitch,
          bearing: ann.view.bearing,
          duration: 2000,
          essential: true
        });

        if (ann.view.elevation !== undefined) {
          mapRef.current.once('idle', () => {
            mapRef.current?.jumpTo({
              center: ann.view.center,
              zoom: ann.view.zoom,
              pitch: ann.view.pitch,
              bearing: ann.view.bearing,
              elevation: ann.view.elevation
            });
          });
        }"""
code = code.replace(
    "mapRef.current.flyTo({\n          center: ann.view.center,\n          zoom: ann.view.zoom,\n          pitch: ann.view.pitch,\n          bearing: ann.view.bearing,\n          duration: 2000,\n          essential: true\n        });",
    flyto_label_replacement
)

flyto_video1 = """            map1!.flyTo({
              center: view.center,
              zoom: view.zoom,
              pitch: view.pitch,
              bearing: view.bearing,
              duration: duration * 1000,
              essential: true
            });
            if (view.elevation !== undefined) {
              map1!.once('idle', () => {
                map1!.jumpTo({
                  center: view.center,
                  zoom: view.zoom,
                  pitch: view.pitch,
                  bearing: view.bearing,
                  elevation: view.elevation
                });
              });
            }"""
code = code.replace(
    "map1!.flyTo({\n              center: view.center,\n              zoom: view.zoom,\n              pitch: view.pitch,\n              bearing: view.bearing,\n              duration: duration * 1000,\n              essential: true\n            });",
    flyto_video1
)


# sync1to2 fix
code = code.replace(
    "map2.jumpTo({ center: map1.getCenter(), zoom: map1.getZoom(), pitch: map1.getPitch(), bearing: map1.getBearing() });",
    "map2.jumpTo({ center: map1.getCenter(), zoom: map1.getZoom(), pitch: map1.getPitch(), bearing: map1.getBearing(), ...(map1.queryTerrainElevation(map1.getCenter()) !== null ? { elevation: map1.queryTerrainElevation(map1.getCenter()) || 0 } : {}) });"
)
code = code.replace(
    "map1.jumpTo({ center: map2.getCenter(), zoom: map2.getZoom(), pitch: map2.getPitch(), bearing: map2.getBearing() });",
    "map1.jumpTo({ center: map2.getCenter(), zoom: map2.getZoom(), pitch: map2.getPitch(), bearing: map2.getBearing(), ...(map2.queryTerrainElevation(map2.getCenter()) !== null ? { elevation: map2.queryTerrainElevation(map2.getCenter()) || 0 } : {}) });"
)

with open('src/components/MapContainer.tsx', 'w') as f:
    f.write(code)

print("Success")
