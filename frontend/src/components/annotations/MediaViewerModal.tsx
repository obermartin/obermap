import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../contexts/I18nContext';
import { CustomTweetView } from './CustomTweetView';
import { X } from 'lucide-react';
import type { Annotation } from '../../types';

interface MediaViewerModalProps {
  annotation: Annotation;
  onClose: () => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({ annotation, onClose }) => {
  const { t } = useTranslation();

  const isVideo = (annotation.mediaUrl && annotation.mediaUrl.match(/\.(mp4|webm|ogg|mov)(\?.*)?$/i)) || (annotation.mediaName && annotation.mediaName.match(/\.(mp4|webm|ogg|mov)$/i));

  let tweetId: string | null = null;
  if (annotation.linkUrl) {
    const tweetRegex = /(?:twitter\.com|x\.com)\/(?:#!\/)?(?:\w+)\/status(?:es)?\/(\d+)/i;
    const match = annotation.linkUrl.match(tweetRegex);
    if (match) tweetId = match[1];
  }

  const [embedStatus, setEmbedStatus] = useState<'loading' | 'allowed' | 'blocked'>('loading');

  useEffect(() => {
    if (annotation.linkUrl && !tweetId) {
      const backendUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
      fetch(`${backendUrl}/api/check-embed?url=${encodeURIComponent(annotation.linkUrl)}`)
        .then(res => res.json())
        .then(data => {
          if (data.embeddable === false) {
            setEmbedStatus('blocked');
          } else {
            setEmbedStatus('allowed');
          }
        })
        .catch(() => {
          // Fallback to allowed and let the browser try
          setEmbedStatus('allowed');
        });
    }
  }, [annotation.linkUrl, tweetId]);

  let displayHeadline = annotation.mediaHeadline || '';

  if (!annotation.mediaHeadline) {
    if (annotation.mediaName) {
      displayHeadline = annotation.mediaName;
    } else if (annotation.mediaUrl) {
      const filename = annotation.mediaUrl.split('/').pop();
      if (filename) {
        displayHeadline = decodeURIComponent(filename);
      }
    } else if (annotation.linkUrl) {
      try {
        displayHeadline = new URL(annotation.linkUrl).hostname;
      } catch {
        displayHeadline = annotation.linkUrl;
      }
    }
  }

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto"
      onClick={onClose}
    >
      <div 
        className="bg-zinc-900 border border-white/10 p-6 flex flex-col shadow-2xl mx-4 rounded-3xl w-[75vw] h-[75vh] relative ui-glass-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-6 right-6 flex items-center gap-4 z-50">
          <button 
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors flex items-center"
            title={t('Close')}
          >
            <X size={32} />
          </button>
        </div>
        
        <div className="flex flex-col flex-1 min-h-0 relative items-center justify-center w-full">
          <style>{`
            .theme-glass .ui-glass-panel.glass-red::before { background: rgba(220, 38, 38, 0.56) !important; }
            .theme-glass .ui-glass-panel.glass-red::after {
              box-shadow: 
                inset 0.63px 1.36px 0.5px color-mix(in srgb, rgba(220, 38, 38, 1) 40%, rgba(255, 255, 255, 1.00)),
                inset -0.63px -1.36px 1px color-mix(in srgb, rgba(220, 38, 38, 1) 40%, rgba(255, 255, 255, 0.55)),
                inset 1.01px 2.18px 4.5px rgba(0, 0, 0, 0.15),
                inset -1.01px -2.18px 4.5px rgba(0, 0, 0, 0.10),
                inset 0 0 30px rgba(255, 255, 255, 0.12),
                inset 0.63px 1.36px 3px rgba(90, 170, 255, 0.00),
                inset -0.63px -1.36px 3px rgba(255, 140, 90, 0.00) !important;
            }
          `}</style>
          
          {annotation.mediaUrl && (
            <div className={`relative z-0 flex justify-center items-center max-h-full max-w-full min-h-0 min-w-0 ${document.querySelector('.theme-glass') ? 'ui-glass-panel rounded-2xl' : ''}`}>
              {displayHeadline && (
                <div className={`absolute z-20 top-[1em] left-[-2em] ${document.querySelector('.theme-glass') ? 'ui-glass-panel rounded-2xl px-6 py-2' : ''}`}>
                  <h1 
                    className="text-[3em] font-bold leading-none text-white text-left whitespace-nowrap"
                    style={
                      document.querySelector('.theme-glass') ? {} :
                      document.querySelector('.theme-light') ? { textShadow: 'rgba(255, 255, 255, 1) 0px 12px 24px, rgba(255, 255, 255, 1) 0px 12px 24px' } :
                      { textShadow: 'rgba(0, 0, 0, 1) 0px 12px 24px, rgba(0, 0, 0, 1) 0px 12px 24px' }
                    }
                  >
                    {displayHeadline}
                  </h1>
                </div>
              )}
              {isVideo ? (
                <div className={`relative w-full h-full flex items-center justify-center ${document.querySelector('.theme-glass') ? 'rounded-2xl' : ''}`}>
                  <video 
                    id="generic-video-player"
                    poster={annotation.mediaUrl.replace(/\.(mp4|webm|ogg|mov)$/i, '.jpg')}
                    controls 
                    
                    className={`max-w-full max-h-full min-h-0 min-w-0 object-contain relative z-10 w-full h-full ${document.querySelector('.theme-glass') ? 'rounded-2xl' : ''}`} 
                    autoPlay 
                    onPlay={() => {
                      const btn = document.getElementById('generic-video-play-btn');
                      if (btn) btn.style.display = 'none';
                    }}
                    onPause={() => {
                      const btn = document.getElementById('generic-video-play-btn');
                      if (btn) btn.style.display = 'flex';
                    }}
                    onClick={(e) => {
                      const video = e.currentTarget;
                      if (video.paused) {
                        video.play().catch(() => {});
                      } else {
                        video.pause();
                      }
                    }}
                  >
                    <source src={annotation.mediaUrl} type="video/mp4" />
                  </video>
                  <button 
                    id="generic-video-play-btn"
                    style={{ display: 'none' }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const video = document.getElementById('generic-video-player') as HTMLVideoElement;
                      if (video) {
                        video.play().catch(() => {});
                        e.currentTarget.style.display = 'none';
                      }
                    }}
                    className="absolute inset-0 m-auto w-24 h-24 items-center justify-center bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors z-20 backdrop-blur-sm pointer-events-auto"
                  >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                </div>
              ) : (
                <img src={annotation.mediaUrl} alt="Icon media" className={`max-w-full max-h-full min-h-0 min-w-0 object-contain relative z-10 ${document.querySelector('.theme-glass') ? 'rounded-2xl' : ''}`} />
              )}
              {annotation.mediaDataSource && (
                <div 
                  className={`absolute z-20 ${isVideo ? 'bottom-[4em]' : 'bottom-[1em]'} right-[-2em] px-4 py-2 font-medium ${
                    document.querySelector('.theme-glass') 
                      ? 'ui-glass-panel glass-red rounded-xl text-[#fff] shadow-xl'
                      : document.querySelector('.theme-light')
                        ? 'bg-[#000] text-[#fff]'
                        : 'bg-[#fff] text-[#000]'
                  }`}
                >
                  QUELLE: {annotation.mediaDataSource}
                </div>
              )}
            </div>
          )}

          {annotation.linkUrl && !annotation.mediaUrl && (
            <div className="relative flex flex-col items-center justify-center w-full h-full max-h-full">
              {displayHeadline && (!tweetId || annotation.mediaHeadline) && (
                <div className={`absolute z-20 top-[1em] left-[-2em] ${document.querySelector('.theme-glass') ? 'ui-glass-panel rounded-2xl px-6 py-2' : ''}`}>
                  <h1 
                    className="text-[3em] font-bold leading-none text-white text-left whitespace-nowrap"
                    style={
                      document.querySelector('.theme-glass') ? {} :
                      document.querySelector('.theme-light') ? { textShadow: 'rgba(255, 255, 255, 1) 0px 12px 24px, rgba(255, 255, 255, 1) 0px 12px 24px' } :
                      { textShadow: 'rgba(0, 0, 0, 1) 0px 12px 24px, rgba(0, 0, 0, 1) 0px 12px 24px' }
                    }
                  >
                    {displayHeadline}
                  </h1>
                </div>
              )}
              {tweetId ? (
                <div className="flex-1 w-full h-full p-2">
                  <CustomTweetView id={tweetId} />
                </div>
              ) : embedStatus === 'loading' ? (
                <div className="flex-1 flex items-center justify-center text-white/50 text-sm">
                  {t('Checking link compatibility...')}
                </div>
              ) : embedStatus === 'blocked' ? (
                <div className="flex-1 flex flex-col gap-4 items-center justify-center p-8 text-center">
                  <div className="text-white/80 max-w-sm">{t('This website prevents embedding for security reasons.')}</div>
                  <a 
                    href={annotation.linkUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-white text-black font-medium text-sm rounded-full hover:bg-white/90 transition-colors"
                  >
                    {t('Open in new tab')}
                  </a>
                </div>
              ) : (
                <iframe 
                  src={annotation.linkUrl} 
                  className="w-full h-full bg-white rounded-xl border-none flex-1"
                  title="Linked content"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              )}
              {annotation.mediaDataSource && (
                <div 
                  className={`absolute z-20 bottom-[1em] right-[-2em] px-4 py-2 font-medium ${
                    document.querySelector('.theme-glass') 
                      ? 'ui-glass-panel glass-red rounded-xl text-[#fff] shadow-xl'
                      : document.querySelector('.theme-light')
                        ? 'bg-[#000] text-[#fff]'
                        : 'bg-[#fff] text-[#000]'
                  }`}
                >
                  QUELLE: {annotation.mediaDataSource}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
