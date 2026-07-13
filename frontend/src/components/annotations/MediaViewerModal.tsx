import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../contexts/I18nContext';
import { Tweet } from 'react-tweet';
import { ExternalLink } from 'lucide-react';
import type { Annotation } from '../../types';

interface MediaViewerModalProps {
  annotation: Annotation;
  onClose: () => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({ annotation, onClose }) => {
  const { t } = useTranslation();

  const isVideo = annotation.mediaUrl && annotation.mediaUrl.match(/\.(mp4|webm|ogg)$/i);

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
        <div className="flex justify-between items-center shrink-0">
          <h3 className="text-white font-semibold text-sm uppercase tracking-wider truncate pr-4">
            {heading}
          </h3>
          <div className="flex items-center gap-4">
            {annotation.linkUrl && (
              <a 
                href={annotation.linkUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-white/60 hover:text-white transition-colors flex items-center"
                title={t('Open in new tab')}
              >
                <ExternalLink size={18} />
              </a>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white transition-colors flex items-center">✕</button>
          </div>
        </div>
        
        <div className="flex flex-col flex-1 min-h-0 relative">
          {annotation.mediaUrl && (
            <div className="flex justify-center overflow-hidden h-full">
              {isVideo ? (
                <video src={annotation.mediaUrl} controls className="w-full h-full object-contain" autoPlay />
              ) : (
                <img src={annotation.mediaUrl} alt="Icon media" className="w-full h-full object-contain" />
              )}
            </div>
          )}

          {annotation.linkUrl && (
            <>
              {tweetId ? (
                <div className="flex-1 w-full h-full overflow-y-auto" data-theme="dark">
                  <div className="flex justify-center min-h-min pb-8 pt-0" style={{ zoom: 1.5, '--tweet-container-margin': '0 auto' } as any}>
                    <Tweet id={tweetId} />
                  </div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
