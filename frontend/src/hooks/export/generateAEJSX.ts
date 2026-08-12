export const generateAEJSX = (viewsToVisit: any[], duration: number) => {
  let script = `(function() {
  app.beginUndoGroup("Import OBERMAP Animation");

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    alert("Please select the containing comp or Map Comp in the Project panel/Timeline before running this script.");
    return;
  }

  var layer = comp.selectedLayers.length > 0 ? comp.selectedLayers[0] : null;
  if (!layer) {
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).property("Effects").property("Latitude") != null) {
        layer = comp.layer(i);
        break;
      }
    }
  }

  if (!layer || layer.property("Effects").property("Latitude") == null) {
    alert("Could not find a layer with Geolayers effects (Latitude, Longitude, Zoom). Please select the Map Comp layer and try again.");
    return;
  }

  function getParam(effectName) {
    var eff = layer.property("Effects").property(effectName);
    if (!eff) return null;
    return eff.property(1); // Get slider/angle value
  }

  var latProp = getParam("Latitude");
  var lonProp = getParam("Longitude");
  var zoomProp = getParam("Zoom");
  var bearingProp = getParam("Bearing");
  var pitchProp = getParam("Pitch");
  
  if (!latProp || !lonProp || !zoomProp) {
      alert("Geolayers properties missing on layer.");
      return;
  }

  // Clear existing keyframes
  while (latProp.numKeys > 0) latProp.removeKey(1);
  while (lonProp.numKeys > 0) lonProp.removeKey(1);
  while (zoomProp.numKeys > 0) zoomProp.removeKey(1);
  if (bearingProp) while (bearingProp.numKeys > 0) bearingProp.removeKey(1);
  if (pitchProp) while (pitchProp.numKeys > 0) pitchProp.removeKey(1);

  var easeIn = new KeyframeEase(0, 33);
  var easeOut = new KeyframeEase(0, 33);

  function addKey(prop, time, value) {
      if (!prop) return;
      var k = prop.addKey(time);
      prop.setValueAtKey(k, value);
      prop.setTemporalEaseAtKey(k, [easeIn], [easeOut]);
  }
`;

  let currentTime = 0;

  for (let i = 0; i < viewsToVisit.length; i++) {
    const v = viewsToVisit[i].view;
    
    if (i > 0) {
      currentTime += duration;
    }
    
    script += `
  addKey(latProp, ${currentTime}, ${v.center[1]});
  addKey(lonProp, ${currentTime}, ${v.center[0]});
  addKey(zoomProp, ${currentTime}, ${v.zoom});
  addKey(bearingProp, ${currentTime}, ${v.bearing || 0});
  addKey(pitchProp, ${currentTime}, ${v.pitch || 0});
`;
    
    // Add hold frame
    if (i === 0) {
      currentTime += 2; // Pause 2s at the start
    } else {
      currentTime += 1; // Pause 1s at each stop
    }
    
    script += `
  addKey(latProp, ${currentTime}, ${v.center[1]});
  addKey(lonProp, ${currentTime}, ${v.center[0]});
  addKey(zoomProp, ${currentTime}, ${v.zoom});
  addKey(bearingProp, ${currentTime}, ${v.bearing || 0});
  addKey(pitchProp, ${currentTime}, ${v.pitch || 0});
`;
  }

  script += `
  app.endUndoGroup();
})();`;

  return script;
};
