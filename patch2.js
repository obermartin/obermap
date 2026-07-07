const fs = require('fs');
const file = 'frontend/src/components/weather/CityWeatherMarkers.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  /const el = marker\.getElement\(\);\n\s*el\.innerHTML = '';\n\s*if \(showTemp\) \{[\s\S]*?(?=\}\);\n\s*console\.log\("Active names for markers:)/,
  `const el = marker.getElement();
      
      let span = el.querySelector('span');
      if (!span) {
        span = document.createElement('span');
        span.className = 'font-bold tracking-tight text-[11px] leading-none';
        el.appendChild(span);
      }
      span.innerText = showTemp ? data.name + ' ' + tempStr : data.name;

      let iconDiv = el.querySelector('div.weather-icon');
      if (showIcon) {
        if (!iconDiv) {
          iconDiv = document.createElement('div');
          iconDiv.className = 'weather-icon';
          el.appendChild(iconDiv);
        }
        iconDiv.innerHTML = iconSvg;
        const svg = iconDiv.querySelector('svg');
        if (svg) {
          svg.setAttribute('width', '14');
          svg.setAttribute('height', '14');
        }
      } else if (iconDiv) {
        iconDiv.remove();
      }
    `
);

fs.writeFileSync(file, code);
