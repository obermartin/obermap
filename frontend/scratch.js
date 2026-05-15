const annCoordinates = [1, 2, 3];
const isRevealed = true;
const annProgress = 0.001; // what if it stops at 0.999?
annCoordinates.forEach((_, i) => {
    const threshold = annCoordinates.length > 1 ? i / (annCoordinates.length - 1) : 0;
    const visible = isRevealed && annProgress > 0 && annProgress >= threshold;
    console.log(`i=${i}, threshold=${threshold}, visible=${visible}`);
});
