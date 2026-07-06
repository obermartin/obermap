const fs = require('fs');
const path = './LayerSidebar.tsx';

let content = fs.readFileSync(path, 'utf8');

// Find all <button ... > tags and inject rounded-full into their className, UNLESS it's a tab button or already has rounded.
// We can use a regex replacement with a replacer function.

content = content.replace(/<button([^>]*?)className=(['"]|`)(.*?)(['"]|`)([^>]*?)>/g, (match, before, quote1, className, quote2, after) => {
  if (className.includes('rounded-') || className.includes('border-b-2')) {
    return match; // Skip tabs (border-b-2) and already rounded ones
  }
  
  // Make sure we only add it to the end of the class string
  const newClassName = `${className} rounded-full`.trim();
  return `<button${before}className=${quote1}${newClassName}${quote2}${after}>`;
});

fs.writeFileSync(path, content, 'utf8');
console.log('Buttons updated in LayerSidebar.tsx');
