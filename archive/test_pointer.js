import fs from 'fs';

// Try to simulate the parsing
const manifestStr = fs.readFileSync('frontend/public/label-templates/Cartoon_New/manifest.json', 'utf8');
const manifest = JSON.parse(manifestStr);

console.log("Pointer override color:", manifest.primary.pointer.overrideColor);
console.log("Pointer color:", manifest.primary.pointer.color);
