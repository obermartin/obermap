import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Trash2 } from 'lucide-react';
import type { Annotation } from '../types';
import { useTranslation } from '../contexts/I18nContext';

interface SavedViewsProps {
  annotations: Annotation[];
  onFlyTo: (view: NonNullable<Annotation['view']>) => void;
  defaultView: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
  isSidebarOpen?: boolean;
  isToolbarOpen?: boolean;
  onDeleteAnnotation?: (id: string) => void;
}

export const SavedViews: React.FC<SavedViewsProps> = ({ annotations, onFlyTo, defaultView, isSidebarOpen, isToolbarOpen, onDeleteAnnotation }) => {
  const { t } = useTranslation();
  const labelAnnotations = annotations.filter(a => (a.type === 'label' || a.type === 'highlight') && a.text && a.view);

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
            onClick={() => onFlyTo(defaultView)}
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

        {labelAnnotations.map((annotation) => (
          <motion.div
            key={annotation.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-stretch border border-white/10 rounded-full overflow-hidden"
          >
            <button
              onClick={() => annotation.view && onFlyTo(annotation.view)}
              className="flex items-center gap-2 bg-black px-4 py-2 text-white hover:bg-white hover:text-black transition-colors grow text-left"
            >
              <span className="font-semibold text-sm uppercase tracking-wider">{annotation.text}</span>
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
          </motion.div>
        ))}

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
