const fs = require('fs');
const path = './LayerSidebar.tsx';

let content = fs.readFileSync(path, 'utf8');

// Replace any class containing bg-white/5 or bg-white/10 inside a button or label tag that doesn't have rounded-full
content = content.replace(/(<(?:button|label)[^>]*?className=(?:['"]|`)[^>]*?(?:bg-white\/5|bg-white\/10)[^>]*?)(?:['"]|`)/g, (match, prefix) => {
  if (match.includes('rounded-full')) return match;
  // match includes the closing quote or backtick at the end.
  // We need to inject " rounded-full" before that quote.
  const quote = match.slice(-1);
  return prefix + " rounded-full" + quote;
});

// For template literal classNames like className={`...`} where the quote is inside the literal
content = content.replace(/className=\{`([^`]*?(?:bg-white\/5|bg-white\/10)[^`]*?)`\}/g, (match, classes) => {
  if (classes.includes('rounded-full')) return match;
  return `className={\`${classes} rounded-full\`}`;
});

fs.writeFileSync(path, content, 'utf8');
console.log('Fixed grey buttons');
