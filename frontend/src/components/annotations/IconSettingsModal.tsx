import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../contexts/I18nContext';
import { customAlert } from '../../utils/dialogService';
import { parseCoordinates } from '../../utils/mapUtils';
import type { Annotation } from '../../types';
import { Trash2 } from 'lucide-react';

interface IconSettingsModalProps {
  annotation: Annotation;
  onSave: (updates: Partial<Annotation>) => void;
  onClose: () => void;
}

export const IconSettingsModal: React.FC<IconSettingsModalProps> = ({ annotation, onSave, onClose }) => {
  const { t } = useTranslation();
  
  const [coordsStr, setCoordsStr] = useState('');
  const [linkUrl, setLinkUrl] = useState(annotation.linkUrl || '');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [previewMediaUrl, setPreviewMediaUrl] = useState(annotation.mediaUrl || '');
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (annotation.coordinates) {
      setCoordsStr(`${annotation.coordinates[1].toFixed(5)}, ${annotation.coordinates[0].toFixed(5)}`);
    }
  }, [annotation.coordinates]);

  const handleSave = async () => {
    const updates: Partial<Annotation> = { linkUrl };
    
    if (!previewMediaUrl && annotation.mediaUrl) {
      updates.mediaUrl = '';
      updates.mediaName = '';
    }
    
    // Parse coordinates
    if (coordsStr.trim()) {
      const parsed = parseCoordinates(coordsStr);
      if (parsed) {
        updates.coordinates = parsed;
      } else {
        await customAlert(t('Invalid GPS Coordinates. Please use format: Lat, Lng'));
        return;
      }
    }

    // Upload file if selected
    if (mediaFile) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', mediaFile);
        const backendUrl = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
        const res = await fetch(`${backendUrl}/api/upload-media`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.success) {
          updates.mediaUrl = `${backendUrl}${data.url}`;
          updates.mediaName = mediaFile.name;
        } else {
          await customAlert(t('Failed to upload media.'));
          setIsUploading(false);
          return;
        }
      } catch (err) {
        console.error(err);
        await customAlert(t('Failed to upload media.'));
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    onSave(updates);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
      <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl mx-4 w-full rounded-3xl">
        <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">
          {t('Icon Settings')}
        </h3>
        
        <div className="flex flex-col gap-1">
          <label className="text-white/60 text-xs">{t('Enter GPS Coordinates (Lat, Lng)')}</label>
          <input
            type="text"
            className="w-full bg-black/60 border border-white/10 px-4 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors rounded-xl"
            value={coordsStr}
            onChange={(e) => setCoordsStr(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          {!previewMediaUrl && (
            <label className="text-white/60 text-xs">{t('Upload Media')}</label>
          )}
          {previewMediaUrl ? (
            <div className="flex items-center gap-4">
              {previewMediaUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                <video src={previewMediaUrl} className="w-24 h-24 object-cover rounded-xl" muted />
              ) : (
                <img src={previewMediaUrl} alt="Preview" className="w-24 h-24 object-cover rounded-xl" />
              )}
              <button 
                onClick={() => {
                  setMediaFile(null);
                  setPreviewMediaUrl('');
                }}
                className="text-white hover:text-white/70 p-2 transition-colors rounded-full hover:bg-white/10"
                title={t('Remove')}
              >
                <Trash2 size={20} />
              </button>
            </div>
          ) : (
            <input
              type="file"
              accept="image/*,video/*"
              disabled={!!linkUrl}
              className={`w-full text-white/80 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 transition-colors ${linkUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const file = e.target.files[0];
                  setMediaFile(file);
                  setPreviewMediaUrl(URL.createObjectURL(file));
                }
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-white/60 text-xs">{t('Enter Link')}</label>
          <input
            type="url"
            placeholder="https://..."
            disabled={!!previewMediaUrl}
            className={`w-full bg-black/60 border border-white/10 px-4 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors rounded-xl ${previewMediaUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors rounded-full"
            disabled={isUploading}
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isUploading}
            className="px-6 py-2 bg-white text-black hover:bg-white/90 text-sm transition-colors rounded-full flex items-center justify-center min-w-[100px]"
          >
            {isUploading ? <span className="animate-pulse">...</span> : t('Save')}
          </button>
        </div>
      </div>
    </div>
  );
};
