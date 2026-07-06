export function scaleMapboxExpression(expr: any, scale: number): any {
  if (scale === 1.0) return expr;
  
  if (typeof expr === 'number') {
    return expr * scale;
  }

  // Handle legacy object syntax (e.g. { stops: [[0, 10], [5, 14]], base: 1.2 })
  if (expr !== null && typeof expr === 'object' && !Array.isArray(expr)) {
    if (expr.stops && Array.isArray(expr.stops)) {
      const newExpr = { ...expr };
      newExpr.stops = expr.stops.map((stop: any[]) => [
        stop[0],
        scaleMapboxExpression(stop[1], scale)
      ]);
      return newExpr;
    }
    // If it's a property function or unknown object, try to just wrap it in a Mapbox expression if supported, 
    // or return it unchanged if we can't reliably scale it without breaking the style.
    // Modern MapLibre supports wrapping property functions.
    return ['*', scale, expr];
  }
  
  if (Array.isArray(expr)) {
    const type = expr[0];
    if (type === 'step') {
      // ['step', input, stop0, zoom1, stop1, ...]
      const newExpr = [...expr];
      for (let i = 2; i < newExpr.length; i++) {
        if (i % 2 === 0) { // Values are at even indices
          newExpr[i] = scaleMapboxExpression(newExpr[i], scale);
        }
      }
      return newExpr;
    } else if (type === 'interpolate') {
      // ['interpolate', interpolation, input, zoom0, stop0, zoom1, stop1, ...]
      const newExpr = [...expr];
      for (let i = 4; i < newExpr.length; i += 2) {
        newExpr[i] = scaleMapboxExpression(newExpr[i], scale);
      }
      return newExpr;
    } else if (type === 'case') {
      // ['case', cond0, val0, cond1, val1, ..., fallback]
      const newExpr = [...expr];
      for (let i = 2; i < newExpr.length; i += 2) {
        newExpr[i] = scaleMapboxExpression(newExpr[i], scale);
      }
      if (newExpr.length % 2 === 0) {
        newExpr[newExpr.length - 1] = scaleMapboxExpression(newExpr[newExpr.length - 1], scale);
      }
      return newExpr;
    } else if (type === 'match') {
      // ['match', input, key0, val0, key1, val1, ..., fallback]
      const newExpr = [...expr];
      for (let i = 3; i < newExpr.length; i += 2) {
        newExpr[i] = scaleMapboxExpression(newExpr[i], scale);
      }
      if (newExpr.length % 2 === 0) {
        newExpr[newExpr.length - 1] = scaleMapboxExpression(newExpr[newExpr.length - 1], scale);
      }
      return newExpr;
    } else if (type === 'literal') {
       return expr;
    } else {
      // For other data-driven expressions (like 'get'), we can wrap them since they don't depend on zoom
      // However, to be safe, if we don't know it, we can wrap it if we are sure it's not a camera expression.
      // But it's safer to just wrap it and hope it's not a zoom expression.
      return ['*', scale, expr];
    }
  }
  
  return expr;
}
