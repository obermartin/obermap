import { Layers } from 'lucide-react';
import { useTranslation } from '../../contexts/I18nContext';

export interface CreateMapModalProps {
  showPrompt: boolean;
  setShowPrompt: (show: boolean) => void;
  newShowName: string;
  setNewShowName: (name: string) => void;
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  shows: any[];
  confirmCreateNew: () => void;
}

export function CreateMapModal({
  showPrompt,
  setShowPrompt,
  newShowName,
  setNewShowName,
  selectedTemplateId,
  setSelectedTemplateId,
  shows,
  confirmCreateNew
}: CreateMapModalProps) {
  const { t } = useTranslation();

  if (!showPrompt) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
      <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-2xl w-full mx-4 shadow-2xl rounded-3xl">
        <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">{t('New Map Name')}</h3>
        <input
          autoFocus
          type="text"
          value={newShowName}
          onChange={e => setNewShowName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') confirmCreateNew();
            if (e.key === 'Escape') setShowPrompt(false);
          }}
          placeholder={t("e.g. My_Awesome_Map")}
          className="w-full bg-black/60 border border-white/10 px-4 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors rounded-full"
        />
        
        <div className="mt-4">
          <h4 className="text-white/60 text-xs font-semibold mb-3 uppercase tracking-wider">{t('Select Template')}</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
            {shows
              .filter(s => s.id === '_DEFAULT' || s.isTemplate)
              .sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id))
              .map(template => (
              <div 
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                className={`relative aspect-video sm:aspect-square bg-transparent rounded-xl cursor-pointer transition-all border-2 ${selectedTemplateId === template.id ? 'border-white p-1' : 'border-transparent'}`}
              >
                <div className="w-full h-full relative rounded-lg overflow-hidden">
                  {template.previewData ? (
                    <img src={template.previewData} className="w-full h-full object-cover" alt={template.title} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-white/20">
                      <Layers size={24} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                    <span className="text-white text-[10px] sm:text-xs font-bold truncate">{template.title || template.id}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-white/10">
          <button 
            onClick={() => setShowPrompt(false)}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors rounded-full font-medium"
          >
            {t('Cancel')}
          </button>
          <button 
            onClick={confirmCreateNew}
            className="px-6 py-2 bg-white text-black hover:bg-white/90 text-sm transition-colors rounded-full font-semibold"
          >
            {t('Create Map')}
          </button>
        </div>
      </div>
    </div>
  );
}
