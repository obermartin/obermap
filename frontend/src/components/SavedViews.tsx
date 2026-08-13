import React from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { Camera, Trash2, Play, GripVertical } from 'lucide-react';
import type { Annotation } from '../types';
import { useTranslation } from '../contexts/I18nContext';
import { customPrompt } from '../utils/dialogService';

const KeyframeDiamond = ({ size = 14, fill = "none" }: { size?: number, fill?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L22 12L12 22L2 12L12 2Z" />
  </svg>
);

const SavedViewItem = ({ annotation, isRevealDisabled, isHideDisabled, onFlyTo, isToolbarOpen, onDeleteAnnotation, selectedAnnotationId, revealTriggerId, hideTriggerId, activeCropOverlay, onRenameAnnotationButton, t }: any) => {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={annotation}
      dragListener={false}
      dragControls={controls}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="flex items-center gap-2"
    >
      <div className={`relative flex items-stretch shadow-lg rounded-full overflow-hidden grow bg-black ui-glass-panel ${selectedAnnotationId === annotation.id ? 'ring-2 ring-ui-text ring-offset-2 ring-offset-black' : ''}`}>
        {isToolbarOpen && (
          <div 
            className="cursor-grab active:cursor-grabbing flex items-center justify-center pl-3 pr-2 bg-black text-ui-text/30 hover:text-ui-text transition-colors shrink-0"
          >
            <GripVertical size={14} />
          </div>
        )}
        <button
          onClick={() => annotation.view && onFlyTo(annotation.id, annotation.view)}
          onDoubleClick={async (e) => {
            e.stopPropagation();
            if (!isToolbarOpen) return;
            const currentName = annotation.buttonText || annotation.text || "";
            const newName = await customPrompt(t("Enter new name for button:"), currentName);
            if (newName !== null && newName.trim() !== "") {
              onRenameAnnotationButton?.(annotation.id, newName.trim());
            }
          }}
          className={`flex items-center gap-2 bg-black py-2 pr-4 text-ui-text hover:bg-ui-text hover:text-ui-bg transition-colors grow text-left ${!isToolbarOpen ? 'pl-4' : 'pl-1'}`}
        >
          <span className="mapview-btn-text font-semibold text-sm uppercase tracking-wider truncate max-w-[200px]">{annotation.buttonText || annotation.text}</span>
        </button>
        {isToolbarOpen && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('requestViewCaptureForUpdate', { detail: annotation.id }));
              }}
              className="flex items-center justify-center px-3 bg-black text-ui-text/50 hover:text-ui-bg hover:bg-ui-text transition-colors shrink-0"
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
                className="flex items-center justify-center px-3 bg-black text-ui-text/50 hover:text-[#ff0000] hover:bg-ui-text transition-colors shrink-0"
                title={t("Delete View")}
              >
                <Trash2 size={16} />
              </button>
            )}
          </>
        )}
      </div>
      {isToolbarOpen && (
        <div className="flex gap-1 shrink-0">
          {activeCropOverlay && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.dispatchEvent(new CustomEvent('updateCropKeyframe', { detail: { targetId: annotation.id, format: activeCropOverlay } }));
              }}
              className={`w-9 h-9 rounded-full flex items-center justify-center border border-ui-border transition-colors shadow-lg ${annotation.cropSettings?.[activeCropOverlay] ? 'bg-ui-text text-ui-bg' : 'bg-black text-ui-text hover:bg-ui-text hover:text-ui-bg'}`}
              title={t("Toggle Crop Keyframe")}
            >
              <KeyframeDiamond size={14} fill={annotation.cropSettings?.[activeCropOverlay] ? "currentColor" : "none"} />
            </button>
          )}
          {selectedAnnotationId && (
            <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('updateAnimationTrigger', { detail: { targetId: selectedAnnotationId, triggerId: annotation.id, clearHideTrigger: isRevealDisabled } }));
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center border border-ui-border transition-colors shadow-lg ${revealTriggerId === annotation.id ? 'bg-ui-text text-ui-bg' : 'bg-black text-ui-text hover:bg-ui-text hover:text-ui-bg'}`}
            title={revealTriggerId === annotation.id ? t("Remove reveal animation trigger") : (isRevealDisabled ? t("Set as reveal trigger (will clear conflicting hide trigger)") : t("Set as reveal animation trigger for selected annotation"))}
          >
            <Play size={14} fill={revealTriggerId === annotation.id ? "currentColor" : "none"} className={revealTriggerId === annotation.id ? '' : 'ml-0.5'} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('updateHideAnimationTrigger', { detail: { targetId: selectedAnnotationId, triggerId: annotation.id, clearRevealTrigger: isHideDisabled } }));
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center border border-ui-border transition-colors shadow-lg ${hideTriggerId === annotation.id ? 'bg-ui-text text-ui-bg' : 'bg-black text-ui-text hover:bg-ui-text hover:text-ui-bg'}`}
            title={hideTriggerId === annotation.id ? t("Remove hide animation trigger") : (isHideDisabled ? t("Set as hide trigger (will clear conflicting reveal trigger)") : t("Set as hide animation trigger for selected annotation"))}
          >
            <Play size={14} fill={hideTriggerId === annotation.id ? "currentColor" : "none"} className={hideTriggerId === annotation.id ? 'scale-x-[-1]' : 'scale-x-[-1] ml-[-2px]'} />
          </button>
            </>
          )}
        </div>
      )}
    </Reorder.Item>
  );
};
interface SavedViewsProps {
  annotations: Annotation[];
  onFlyTo: (viewId: string, view: NonNullable<Annotation['view']>) => void;
  defaultView: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    buttonText?: string;
    cropSettings?: {
      landscape?: { scale: number; offsetX: number; offsetY: number };
      portrait?: { scale: number; offsetX: number; offsetY: number };
      square?: { scale: number; offsetX: number; offsetY: number };
    };
  };
  isSidebarOpen?: boolean;
  isToolbarOpen?: boolean;
  onDeleteAnnotation?: (id: string) => void;
  selectedAnnotationId?: string | null;
  onReorderAnnotations?: (reorderedIds: string[]) => void;
  activeCropOverlay?: 'landscape' | 'portrait' | 'square' | null;
  onRenameAnnotationButton?: (id: string, newName: string) => void;
  onRenameOverviewButton?: (newName: string) => void;
}

export const SavedViews: React.FC<SavedViewsProps> = ({ annotations, onFlyTo, defaultView, isSidebarOpen, isToolbarOpen, onDeleteAnnotation, selectedAnnotationId, onReorderAnnotations, activeCropOverlay, onRenameAnnotationButton, onRenameOverviewButton }) => {
  const { t } = useTranslation();
  const labelAnnotations = annotations.filter(a => (a.type === 'label' || a.type === 'highlight' || a.type === 'headline' || a.type === 'view') && a.text && a.view);

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
          key="overview-panel"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-2"
        >
          <div className="relative flex items-stretch shadow-lg rounded-full overflow-hidden grow bg-black ui-glass-panel">
            <button
              onClick={() => onFlyTo('overview', defaultView)}
              onDoubleClick={async (e) => {
                e.stopPropagation();
                if (!isToolbarOpen) return;
                const currentName = defaultView.buttonText || t('OVERVIEW');
                const newName = await customPrompt(t("Enter new name for button:"), currentName);
                if (newName !== null && newName.trim() !== "") {
                  onRenameOverviewButton?.(newName.trim());
                }
              }}
              className="flex items-center gap-2 bg-black px-4 py-2 text-ui-text hover:bg-ui-text hover:text-ui-bg transition-colors grow text-left"
            >
              <span className="mapview-btn-text font-semibold text-sm uppercase tracking-wider">{defaultView.buttonText || t('OVERVIEW')}</span>
            </button>
            {isToolbarOpen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(new CustomEvent('requestViewCaptureForDefaultUpdate'));
                }}
                className="flex items-center justify-center px-3 bg-black text-ui-text/50 hover:text-ui-bg hover:bg-ui-text transition-colors shrink-0"
                title={t("Update Overview Camera")}
              >
                <Camera size={16} />
              </button>
            )}
          </div>
          {isToolbarOpen && activeCropOverlay && (
            <div className="flex gap-1 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(new CustomEvent('updateCropKeyframe', { detail: { targetId: 'overview', format: activeCropOverlay } }));
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center border border-ui-border transition-colors shadow-lg ${defaultView.cropSettings?.[activeCropOverlay] ? 'bg-ui-text text-ui-bg' : 'bg-black text-ui-text hover:bg-ui-text hover:text-ui-bg'}`}
                title={t("Toggle Crop Keyframe")}
              >
                <KeyframeDiamond size={14} fill={defaultView.cropSettings?.[activeCropOverlay] ? "currentColor" : "none"} />
              </button>
            </div>
          )}
        </motion.div>

        <Reorder.Group key="reorder-group" as="div" axis="y" values={labelAnnotations} onReorder={(newOrder) => onReorderAnnotations?.(newOrder.map(a => a.id))} className="flex flex-col gap-2">
          <AnimatePresence>
            {labelAnnotations.map((annotation, index) => {
              const isRevealDisabled = hideIndex !== -1 && index >= hideIndex;
              const isHideDisabled = revealIndex !== -1 && index <= revealIndex;

              return (
                <SavedViewItem
                  key={annotation.id}
                  annotation={annotation}
                  index={index}
                  isRevealDisabled={isRevealDisabled}
                  isHideDisabled={isHideDisabled}
                  onFlyTo={onFlyTo}
                  isToolbarOpen={isToolbarOpen}
                  onDeleteAnnotation={onDeleteAnnotation}
                  selectedAnnotationId={selectedAnnotationId}
                  revealTriggerId={revealTriggerId}
                  hideTriggerId={hideTriggerId}
                  activeCropOverlay={activeCropOverlay}
                  onRenameAnnotationButton={onRenameAnnotationButton}
                  t={t}
                />
              );
            })}
          </AnimatePresence>
        </Reorder.Group>

        {isToolbarOpen && (
          <motion.button
            key="add-position"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={handleAddPosition}
            className="relative overflow-hidden w-10 h-10 flex items-center justify-center bg-black text-ui-text hover:bg-ui-text hover:text-ui-bg transition-colors mt-2 rounded-full shadow-lg ui-glass-panel"
            title={t("Add current view position")}
          >
            <Camera size={20} strokeWidth={1.5} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};
