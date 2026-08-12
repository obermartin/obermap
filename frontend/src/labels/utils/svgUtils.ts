export function extractSvgInner(svgString: string): string {
  const match = svgString.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  return match ? match[1] : svgString;
}

export function parseMiddleSourceDimensions(svgString: string): {
  sourceWidth: number;
  sourceHeight: number;
} {
  let sourceWidth = 1,
    sourceHeight = 1;
  const viewBoxMatch = svgString.match(/viewBox="([^"]+)"/);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/[ ,]+/).map(parseFloat);
    if (parts.length === 4) {
      sourceWidth = parts[2];
      sourceHeight = parts[3];
    }
  } else {
    const wMatch = svgString.match(/width="([^"]+)"/);
    const hMatch = svgString.match(/height="([^"]+)"/);
    if (wMatch) sourceWidth = parseFloat(wMatch[1]);
    if (hMatch) sourceHeight = parseFloat(hMatch[1]);
  }
  return { sourceWidth, sourceHeight };
}

export function normalizeSvg(svgString: string, cssVarName: string | null): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return svgString;

  const styles = doc.querySelectorAll("style");
  const rules: Record<string, Record<string, string>> = {};

  styles.forEach((style) => {
    const text = style.textContent || "";
    const regex = /\.([a-zA-Z0-9_-]+)\s*{([^}]+)}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const className = match[1];
      const declarations = match[2];
      const props: Record<string, string> = {};
      declarations.split(";").forEach((decl) => {
        const [prop, val] = decl.split(":").map((s) => s.trim());
        if (prop && val) props[prop] = val;
      });
      rules[className] = props;
    }
  });

  const allEls = svg.querySelectorAll("*");
  allEls.forEach((el) => {
    if (el.hasAttribute("class")) {
      const classes = el.getAttribute("class")?.split(/\s+/) || [];
      classes.forEach((cls) => {
        if (rules[cls]) {
          ["fill", "stroke", "opacity", "stroke-width"].forEach((attr) => {
            if (rules[cls][attr] && !el.hasAttribute(attr)) {
              el.setAttribute(attr, rules[cls][attr]);
            }
          });
        }
      });
      el.removeAttribute("class");
    }

    let fillVal = el.getAttribute("fill");
    const elAny = el as any;
    if (elAny.style && elAny.style.fill) {
      fillVal = elAny.style.fill;
      elAny.style.removeProperty("fill");
    }
    if (fillVal && fillVal !== "none" && !fillVal.startsWith("url(")) {
      if (cssVarName) {
        el.setAttribute("fill", `var(${cssVarName}, ${fillVal})`);
      } else {
        el.setAttribute("fill", fillVal);
      }
    }
  });

  styles.forEach((style) => style.remove());
  doc.querySelectorAll("defs").forEach((def) => {
    if (def.children.length === 0) def.remove();
  });

  if (doc.querySelector("style")) {
    console.warn(
      "SVG still contains a <style> block after normalization. Rendering may be incorrect.",
    );
  }

  return svg.outerHTML;
}
