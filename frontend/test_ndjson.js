const text = `{ "type": "Feature", "properties": { "foo": "bar" } }
{ "type": "Feature", "properties": { "foo": "baz" } }`;

const lines = text.split('\n');
const features = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  try {
    const obj = JSON.parse(trimmed);
    if (obj.type === 'FeatureCollection' && obj.features) {
      features.push(...obj.features);
    } else if (obj.type === 'Feature') {
      features.push(obj);
    }
  } catch (e) {}
}
console.log(features.length);
