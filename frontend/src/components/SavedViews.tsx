import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import type { Annotation } from '../types';

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
}

export const SavedViews: React.FC<SavedViewsProps> = ({ annotations, onFlyTo, defaultView, isSidebarOpen, isToolbarOpen }) => {
  const labelAnnotations = annotations.filter(a => (a.type === 'label' || a.type === 'highlight') && a.text && a.view);

  const handleAddPosition = () => {
    const event = new CustomEvent('requestViewCaptureForPosition');
    window.dispatchEvent(event);
  };

  return (
    <div className={`absolute top-6 left-6 z-10 flex flex-col gap-2 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-[20rem]' : 'translate-x-0'}`}>
      <AnimatePresence>
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={() => onFlyTo(defaultView)}
            className="flex items-center gap-2 bg-black border border-white/10 px-4 py-2 text-white hover:bg-white hover:text-black transition-colors group"
        >
          <span className="font-semibold text-sm uppercase tracking-wider">ÜBERSICHT</span>
        </motion.button>

        {labelAnnotations.map((annotation) => (
          <motion.button
            key={annotation.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => annotation.view && onFlyTo(annotation.view)}
              className="flex items-center gap-2 bg-black border border-white/10 px-4 py-2 text-white hover:bg-white hover:text-black transition-colors group"
          >
            <span className="font-semibold text-sm uppercase tracking-wider">{annotation.text}</span>
          </motion.button>
        ))}

        {isToolbarOpen && (
          <motion.button
            key="add-position"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={handleAddPosition}
            className="w-10 h-10 flex items-center justify-center bg-black border border-white/10 text-white hover:bg-white hover:text-black transition-colors mt-2"
            title="Save Current Position"
          >
            <Plus size={20} strokeWidth={1.5} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
