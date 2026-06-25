import spec from '@maplibre/maplibre-gl-style-spec';
const { validateFilter } = spec;

const maxRank = 8; // For density 50
const classBasedRank = ['case',
  ['==', ['get', 'class'], 'city'], 5,
  ['==', ['get', 'class'], 'town'], 10,
  ['==', ['get', 'class'], 'village'], 15,
  ['any',
    ['==', ['get', 'class'], 'hamlet'],
    ['==', ['get', 'class'], 'suburb'],
    ['==', ['get', 'class'], 'neighbourhood'],
    ['==', ['get', 'class'], 'isolated_dwelling']
  ], 20,
  30
];
const rankCondition = ['<=', ['coalesce', ['get', 'symbolrank'], ['get', 'scalerank'], ['get', 'rank'], classBasedRank], maxRank];
const capCondition = ['all', ['has', 'capital'], ['>', ['get', 'capital'], 0]];
const isCountry = ['any', ['==', ['get', 'class'], 'country'], ['==', ['get', 'type'], 'country']];
const extraCondition = ['any', rankCondition, capCondition, isCountry];

const style = {
  version: 8,
  layers: [
    {
      id: "test",
      type: "symbol",
      source: "foo",
      filter: extraCondition
    }
  ]
};

console.log('Errors:', spec.validate(style));
