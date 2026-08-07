import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../../contexts/I18nContext';
import type { Annotation, ToolType } from '../../types';
import { globalLabelManager } from '../../labels/LabelMarkerManager';

export const HeadlineSVGTemplateRenderer: React.FC<{ ann: Annotation }> = ({ ann }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || !ann.template) return;
    
    let isMounted = true;
    let handle: any = null;

    const init = async () => {
      try {
        if (!globalLabelManager.templates.has(ann.template!)) {
          await globalLabelManager.loadTemplates([ann.template!]);
        }
        if (!isMounted) return;

        handle = globalLabelManager.createLabel({
           id: `headline-${ann.id}`,
           lngLat: [0, 0], // irrelevant for headline since it's absolutely positioned
           text: { primary: ann.text || '', secondary: ann.secondaryText },
           template: ann.template!,
           theme: ann.theme,
           hidePointer: true
        });

        handleRef.current = handle;
        const el = handle.getElement();
        el.style.position = 'relative'; // reset position to relative within container
        el.style.transform = 'none'; // reset transform since we don't need pointer tip anchor
        
        if (containerRef.current) {
          containerRef.current.innerHTML = ''; // Ensure container is empty to prevent duplication in React 18 Strict Mode
          containerRef.current.appendChild(el);
        }
      } catch (e) {
        console.error("Error creating headline label:", e);
      }
    };

    init();

    return () => {
       isMounted = false;
       if (handle) {
          handle.remove();
       }
       if (handleRef.current) {
          const el = handleRef.current.getElement();
          if (containerRef.current && el.parentNode === containerRef.current) {
             containerRef.current.removeChild(el);
          }
       }
    };
  }, [ann.id, ann.template]); // Recreate entirely if template changes

  useEffect(() => {
     if (handleRef.current) {
        // LabelMarkerManager handles these updates correctly (we'll implement setText/setTheme if needed, or recreate if they don't exist)
        if (handleRef.current.setText) handleRef.current.setText({ primary: ann.text || '', secondary: ann.secondaryText });
        if (ann.theme && handleRef.current.setTheme) handleRef.current.setTheme(ann.theme);
        
        // Ensure LabelMarkerManager doesn't apply its own negative offsets which overshoot the container bounding box
        const el = handleRef.current.getElement();
        if (el) el.style.transform = 'none';
     }
  }, [ann.text, ann.secondaryText, ann.theme]);

  return <div ref={containerRef} className="pointer-events-none" />;
};

interface HeadlineOverlaysProps {
  annotations: Annotation[];
  activeTool: ToolType;
  selectedAnnotationId: string | null;
  revealedTriggers: Set<string>;
  hiddenTriggers: Set<string>;
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  setHeadlinePrompt?: React.Dispatch<React.SetStateAction<{ id?: string, initialPrimary?: string, initialSecondary?: string } | null>>;
}

export const HeadlineOverlays: React.FC<HeadlineOverlaysProps> = ({
  annotations,
  activeTool,
  selectedAnnotationId,
  revealedTriggers,
  hiddenTriggers,
  setAnnotations,
  setSelectedAnnotationId,
  setHeadlinePrompt
}) => {
  const { t } = useTranslation();
  const [isDraggingHeadlineId, setIsDraggingHeadlineId] = useState<string | null>(null);

  return (
    <>
      <AnimatePresence>
        {isDraggingHeadlineId && (
          <motion.div
            key="headline-dropzone"
            initial={{ y: -64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -64, opacity: 0 }}
            id="headline-dropzone"
            className="fixed top-0 left-0 w-full h-20 p-3 z-[100] bg-black/20 backdrop-blur-md transition-colors duration-200 pointer-events-none"
          >
            <div id="headline-dropzone-inner" className="w-full h-full flex items-center justify-center border-2 border-dashed border-white/30 rounded-xl transition-colors duration-200">
              <span className="text-white/80 font-bold tracking-widest uppercase text-sm">{t("Drop here to center horizontally")}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {annotations.filter(a => a.type === 'headline').map((ann) => {
        const overrideVisible = activeTool !== 'none';
        const triggerExists = (id: string | undefined) => id ? annotations.some(a => a.id === id) : false;
        const hasRevealTrigger = !!ann.animationTriggerId && triggerExists(ann.animationTriggerId);
        const hasHideTrigger = !!ann.hideAnimationTriggerId && triggerExists(ann.hideAnimationTriggerId);
        const isHidden = !overrideVisible && ((hasHideTrigger && hiddenTriggers.has(ann.hideAnimationTriggerId!)) || hiddenTriggers.has(ann.id));
        const isRevealed = overrideVisible || (!hasRevealTrigger || revealedTriggers.has(ann.animationTriggerId!));
        const opacity = isRevealed && !isHidden ? 1 : 0;
        const isSelected = selectedAnnotationId === ann.id;
        
        return (
          <motion.div
            key={ann.id}
            data-id={ann.id}
            drag={activeTool === 'headline' || isSelected}
            dragMomentum={false}
            onDragStart={() => {
              if (activeTool === 'headline' || isSelected) {
                setIsDraggingHeadlineId(ann.id);
              }
            }}
            onDrag={(_e, info) => {
              if (activeTool !== 'headline' && !isSelected) return;
              const isHovering = info.point.y < 80;
              const dzInner = document.getElementById('headline-dropzone-inner');
              if (dzInner) {
                if (isHovering) {
                  dzInner.classList.add('bg-white/20', 'border-white');
                  dzInner.classList.remove('border-white/30');
                } else {
                  dzInner.classList.remove('bg-white/20', 'border-white');
                  dzInner.classList.add('border-white/30');
                }
              }
            }}
            onDragEnd={(_e, info) => {
              setIsDraggingHeadlineId(null);
              if (activeTool !== 'headline' && !isSelected) return;
              
              const isDropZone = info.point.y < 80;
              
              setAnnotations(prev => prev.map(a => {
                if (a.id === ann.id) {
                  let currentX = a.screenPosition?.x || 0;
                  if (a.isCentered) {
                    currentX = window.innerWidth / 2;
                  }
                  let newX = currentX + info.offset.x;
                  let newY = (a.screenPosition?.y || 0) + info.offset.y;
                  let isCentered = false;
                  
                  if (isDropZone) {
                    isCentered = true;
                    newX = 0;
                    newY = 40; // Centered vertically in the drop zone
                  }
                  return { ...a, screenPosition: { x: newX, y: newY }, isCentered };
                }
                return a;
              }));
            }}
            initial={false}
            animate={{ opacity }}
            transition={{ duration: 0.3 }}
            onPointerDown={(e) => {
              if ((activeTool !== 'none' && activeTool !== 'highlight') || isSelected) {
                e.stopPropagation();
                setSelectedAnnotationId(ann.id);
              }
            }}
            onDoubleClick={(e) => {
              if (activeTool === 'headline' || isSelected) {
                e.stopPropagation();
                if (setHeadlinePrompt) {
                  setHeadlinePrompt({ id: ann.id, initialPrimary: ann.text, initialSecondary: ann.secondaryText });
                }
              }
            }}
            className={`headline-overlay-element absolute z-[45] flex items-center gap-3 ${activeTool === 'headline' || isSelected ? 'cursor-grab active:cursor-grabbing' : (activeTool !== 'none' && activeTool !== 'highlight' ? 'cursor-pointer' : 'pointer-events-none')} ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}
            style={{
              left: ann.isCentered ? '50vw' : (ann.screenPosition?.x || 0),
              top: ann.screenPosition?.y || 0,
              x: '-50%',
              y: '-50%',
            }}
          >
            <HeadlineSVGTemplateRenderer ann={ann} />
          </motion.div>
        );
      })}
    </>
  );
};
