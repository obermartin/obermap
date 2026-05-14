import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Trash2, Play } from 'lucide-react';
import type { Annotation } from '../types';
import { useTranslation } from '../contexts/I18nContext';

interface SavedViewsProps {
  annotations: Annotation[];
  onFlyTo: (viewId: string, view: NonNullable<Annotation['view']>) => void;
  defaultView: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
  isSidebarOpen?: boolean;
  isToolbarOpen?: boolean;
  onDeleteAnnotation?: (id: string) => void;
  selectedAnnotationId?: string | null;
}

export const SavedViews: React.FC<SavedViewsProps> = ({ annotations, onFlyTo, defaultView, isSidebarOpen, isToolbarOpen, onDeleteAnnotation, selectedAnnotationId }) => {
  const { t } = useTranslation();
  const labelAnnotations = annotations.filter(a => (a.type === 'label' || a.type === 'highlight') && a.text && a.view);

  const selectedAnn = annotations.find(a => a.id === selectedAnnotationId);
  const revealTriggerId = selectedAnn?.animationTriggerId;
  const hideTriggerId = selectedAnn?.hideAnimationTriggerId;
  const revealIndex = revealTriggerId ? labelAnnotations.findIndex(a => a.id === revealTriggerId) : -1;
  const hideIndex = hideTriggerId ? labelAnnotations.findIndex(a => a.id === hideTriggerId) : -1;

  const handleAddPosition = () => {
    const event = new CustomEvent('requestViewCaptureForPosition');
    window.dispatchEvent(event);
  };

  return (
    <div className={`absolute top-6 left-6 z-10 flex flex-col gap-2 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-[20rem]' : 'translate-x-0'}`}>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-stretch border border-white/10 rounded-full overflow-hidden"
        >
          <button
            onClick={() => onFlyTo('overview', defaultView)}
            className="flex items-center gap-2 bg-black px-4 py-2 text-white hover:bg-white hover:text-black transition-colors grow text-left"
          >
            <span className="font-semibold text-sm uppercase tracking-wider">{t('OVERVIEW')}</span>
          </button>
          {isToolbarOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('requestViewCaptureForDefaultUpdate'));
              }}
              className="flex items-center justify-center px-3 bg-black text-white/50 hover:text-black hover:bg-white transition-colors shrink-0 border-l border-white/10"
              title={t("Update Overview Camera")}
            >
              <Camera size={16} />
            </button>
          )}
        </motion.div>

        {labelAnnotations.map((annotation, index) => {
          const isRevealDisabled = hideIndex !== -1 && index >= hideIndex;
          const isHideDisabled = revealIndex !== -1 && index <= revealIndex;

          return (
          <motion.div
            key={annotation.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2"
          >
            <div className={`flex items-stretch border border-white/10 rounded-full overflow-hidden grow ${selectedAnnotationId === annotation.id ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}>
              <button
                onClick={() => annotation.view && onFlyTo(annotation.id, annotation.view)}
                className="flex items-center gap-2 bg-black px-4 py-2 text-white hover:bg-white hover:text-black transition-colors grow text-left"
              >
                <span className="font-semibold text-sm uppercase tracking-wider truncate max-w-[200px]">{annotation.text}</span>
              </button>
              {isToolbarOpen && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(new CustomEvent('requestViewCaptureForUpdate', { detail: annotation.id }));
                    }}
                    className="flex items-center justify-center px-3 bg-black text-white/50 hover:text-black hover:bg-white transition-colors shrink-0 border-l border-white/10"
                    title={t("Update View Camera")}
                  >
                    <Camera size={16} />
                  </button>
                  {onDeleteAnnotation && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAnnotation(annotation.id);
                      }}
                      className="flex items-center justify-center px-3 bg-black text-white/50 hover:text-[#ff0000] hover:bg-white transition-colors shrink-0 border-l border-white/10"
                      title={t("Delete View")}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </>
              )}
            </div>
            {isToolbarOpen && selectedAnnotationId && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('updateAnimationTrigger', { detail: { targetId: selectedAnnotationId, triggerId: annotation.id, clearHideTrigger: isRevealDisabled } }));
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border border-white/10 transition-colors shadow-lg ${revealTriggerId === annotation.id ? 'bg-white text-black' : 'bg-black text-white hover:bg-white hover:text-black'}`}
                  title={isRevealDisabled ? t("Set as reveal trigger (will clear conflicting hide trigger)") : t("Set as reveal animation trigger for selected annotation")}
                >
                  <Play size={14} fill={revealTriggerId === annotation.id ? "currentColor" : "none"} className={revealTriggerId === annotation.id ? '' : 'ml-0.5'} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(new CustomEvent('updateHideAnimationTrigger', { detail: { targetId: selectedAnnotationId, triggerId: annotation.id, clearRevealTrigger: isHideDisabled } }));
                  }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center border border-white/10 transition-colors shadow-lg ${hideTriggerId === annotation.id ? 'bg-white text-black' : 'bg-black text-white hover:bg-white hover:text-black'}`}
                  title={isHideDisabled ? t("Set as hide trigger (will clear conflicting reveal trigger)") : t("Set as hide animation trigger for selected annotation")}
                >
                  <Play size={14} fill={hideTriggerId === annotation.id ? "currentColor" : "none"} className={hideTriggerId === annotation.id ? 'scale-x-[-1]' : 'scale-x-[-1] ml-[-2px]'} />
                </button>
              </div>
            )}
          </motion.div>
        )})}

        {isToolbarOpen && (
          <motion.button
            key="add-position"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={handleAddPosition}
            className="w-10 h-10 flex items-center justify-center bg-black border border-white/10 text-white hover:bg-white hover:text-black transition-colors mt-2 rounded-full"
            title={t("Save Current Position")}
          >
            <Camera size={20} strokeWidth={1.5} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
