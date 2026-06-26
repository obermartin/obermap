import os

file_path = '/Users/obermartin/Documents/CURRENT/BILD/OBERMAP2/frontend/src/components/MapContainer.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Add imageExportScale to videoExportState
content = content.replace(
    '    height: number;\n  }>',
    '    height: number;\n    imageExportScale?: number;\n  }>'
)

# 2. Add imageExportScale to MapboxMap props inside the component body
content = content.replace(
    '  isExporting\n}) => {',
    '  isExporting,\n  imageExportScale\n}) => {'
)

# 3. Apply imageExportScale to basemap scaling
content = content.replace(
    'const scale = (isExporting || settings.exportScalePreview) ? (settings.exportBasemapScale ?? 1.0) : 1.0;',
    'const scale = (isExporting || settings.exportScalePreview) ? (settings.exportBasemapScale ?? 1.0) * (imageExportScale || 1.0) : 1.0;'
)

# 4. Pass imageExportScale into videoExportState during image export
content = content.replace(
    '''          scaleTransform: `scale(${scale})`,
          width: targetWidth,
          height: targetHeight
        });''',
    '''          scaleTransform: `scale(${scale})`,
          width: targetWidth,
          height: targetHeight,
          imageExportScale: scaleFactor
        });'''
)

# 5. Pass imageExportScale from videoExportState to MapboxMap
content = content.replace(
    'isExporting={!!videoExportState}',
    'isExporting={!!videoExportState} imageExportScale={videoExportState?.imageExportScale}'
)

# 6. Video Export Compositor: Add ctx.scale
content = content.replace(
    '''          const point = map1!.project(lngLat);
          ctx.save();
          ctx.translate(point.x, point.y);
          
          let innerEl = el;''',
    '''          const point = map1!.project(lngLat);
          ctx.save();
          ctx.translate(point.x, point.y);
          
          const annScale = props.settings.exportAnnotationScale ?? 1.0;
          ctx.scale(annScale, annScale);
          
          let innerEl = el;'''
)

# 7. Video Export Compositor: getRasterizedImage with scale
content = content.replace(
    '''const img = await globalLabelManager.getRasterizedImage(ann.id);''',
    '''const img = await globalLabelManager.getRasterizedImage(ann.id, props.settings.exportAnnotationScale ?? 1.0);'''
)

# 8. Video Export Compositor: drawImage with unscaling
content = content.replace(
    '''               const offset = globalLabelManager.getAnchorOffset(id);
               if (offset) {
                 ctx.drawImage(img, -offset.x, -offset.y);
               }''',
    '''               const offset = globalLabelManager.getAnchorOffset(id);
               const currentScale = props.settings.exportAnnotationScale ?? 1.0;
               if (offset) {
                 ctx.drawImage(img, -offset.x, -offset.y, img.naturalWidth / currentScale, img.naturalHeight / currentScale);
               }'''
)

# 9. Image Export Compositor: drawImage with unscaling
content = content.replace(
    '''               const offset = globalLabelManager.getAnchorOffset(id);
               if (offset) {
                 ctx.drawImage(img, -offset.x, -offset.y);
               }''',
    '''               const offset = globalLabelManager.getAnchorOffset(id);
               const currentScale = exportScale * (props.settings.exportAnnotationScale ?? 1.0);
               if (offset) {
                 ctx.drawImage(img, -offset.x, -offset.y, img.naturalWidth / currentScale, img.naturalHeight / currentScale);
               }'''
)

# 10. Image/Video Export Compositor: fix Country marker opacity (in both places it contains 'custom-country-marker')
content = content.replace(
    '''          else if (innerEl.classList.contains('custom-country-marker')) {
            const plate = innerEl.querySelector('.custom-country-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-country-text') as HTMLElement;''',
    '''          else if (innerEl.classList.contains('custom-country-marker')) {
            ctx.globalAlpha = 1.0; // Force full opacity for country markers
            const plate = innerEl.querySelector('.custom-country-plate') as HTMLElement;
            const textEl = innerEl.querySelector('.custom-country-text') as HTMLElement;'''
)


with open(file_path, 'w') as f:
    f.write(content)

print("Done")
