import maplibregl from 'maplibre-gl';
import { validateFilter } from '@maplibre/maplibre-gl-style-spec';

const origFilter = ['==', 'class', 'city']; // A legacy filter

const maxRank = 15;
const classBasedRank = ['case',
  ['==', ['get', 'class'], 'city'], 5,
  ['==', ['get', 'class'], 'town'], 10,
  ['==', ['get', 'class'], 'village'], 15,
  ['in', ['get', 'class'], ['literal', ['hamlet', 'suburb', 'neighbourhood', 'isolated_dwelling']]], 20,
  30
];
const rankCondition = ['<=', ['coalesce', ['get', 'symbolrank'], ['get', 'scalerank'], ['get', 'rank'], classBasedRank], maxRank];
const capCondition = ['all', ['has', 'capital'], ['>', ['get', 'capital'], 0]];
const isCountry = ['any', ['==', ['get', 'class'], 'country'], ['==', ['get', 'type'], 'country']];
const extraCondition = ['any', rankCondition, capCondition, isCountry];

const combined = ['all', origFilter, extraCondition];

console.log('Errors:', validateFilter(combined));
