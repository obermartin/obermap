import React from 'react';
import { useTranslation } from '../../contexts/I18nContext';
import type { Annotation } from '../../types';

interface MediaViewerModalProps {
  annotation: Annotation;
  onClose: () => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({ annotation, onClose }) => {
  const { t } = useTranslation();

  const isVideo = annotation.mediaUrl && annotation.mediaUrl.match(/\.(mp4|webm|ogg)$/i);

  let heading = t('Media Viewer');
  if (annotation.mediaName) {
    heading = annotation.mediaName;
  } else if (annotation.mediaUrl) {
    const filename = annotation.mediaUrl.split('/').pop();
    if (filename) heading = decodeURIComponent(filename);
  } else if (annotation.linkUrl) {
    try {
      heading = new URL(annotation.linkUrl).hostname;
    } catch {
      heading = annotation.linkUrl;
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto"
      onClick={onClose}
    >
      <div 
        className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 shadow-2xl mx-4 rounded-3xl w-[75vw] h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center">
          <h3 className="text-white font-semibold text-sm uppercase tracking-wider truncate pr-4">
            {heading}
          </h3>
          <button onClick={onClose} className="text-white/60 hover:text-white">✕</button>
        </div>
        
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {annotation.mediaUrl && (
            <div className="flex justify-center bg-black/50 rounded-xl overflow-hidden h-full">
              {isVideo ? (
                <video src={annotation.mediaUrl} controls className="w-full h-full object-contain" autoPlay />
              ) : (
                <img src={annotation.mediaUrl} alt="Icon media" className="w-full h-full object-contain" />
              )}
            </div>
          )}

          {annotation.linkUrl && (
            <div className="flex flex-col gap-1 h-full">
              <label className="text-white/60 text-xs flex justify-between items-center">
                <span>{t('Link')}</span>
                <a 
                  href={annotation.linkUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline text-xs"
                >
                  {t('Open in new tab')}
                </a>
              </label>
              <iframe 
                src={annotation.linkUrl} 
                className="w-full h-full bg-white rounded-xl border-none flex-1"
                title="Linked content"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
