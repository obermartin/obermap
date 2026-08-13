import { normalizeSvg } from './frontend/src/labels/utils/svgUtils.js';
import fs from 'fs';
import path from 'path';

// Note: svgUtils is TypeScript, so running it with plain node won't work unless we compile or use ts-node.
// Let's just mock the function here to test it.

const svgString = fs.readFileSync('./label sources/highlight_glassy/primary_middle.svg', 'utf-8');

function normalizeSvgMock(svgString, cssVarName, idSuffix) {
  // We can't use DOMParser in Node.js easily without jsdom.
  // We just want to test the regex part!
  
  const idMap = new Map();
  // Mocking the behavior
  idMap.set("linear-gradient", "linear-gradient" + idSuffix);
  idMap.set("linear-gradient-2", "linear-gradient-2" + idSuffix);
  idMap.set("clippath", "clippath" + idSuffix);
  
  let resultHtml = svgString;
  if (idSuffix && idMap.size > 0) {
    idMap.forEach((newId, oldId) => {
      // replace url(#oldId) with url(#newId) anywhere it appears
      resultHtml = resultHtml.replace(new RegExp(`url\\(#${oldId}\\)`, "g"), `url(#${newId})`);
    });
  }
  return resultHtml;
}

const res = normalizeSvgMock(svgString, null, '-testSuffix');
console.log(res.includes('url(#linear-gradient-testSuffix)'));
console.log(res.includes('url(#linear-gradient-2-testSuffix)'));
console.log(res.includes('url(#clippath-testSuffix)'));
