import { Play, Link as LinkIcon, Trash2, Copy, Lock, Unlock, Folder, FolderOpen, ChevronDown, Loader2 } from 'lucide-react';
import { useTranslation } from '../../contexts/I18nContext';

export interface MapListProps {
  shows: any[];
  loading: boolean;
  isDefaultUnlocked: boolean;
  setIsDefaultUnlocked: (unlocked: boolean) => void;
  setShowUnlockWarning: (show: boolean) => void;
  handleRename: (showId: string) => void;
  onSelectShow: (showId: string) => void;
  handleLink: (showId: string) => void;
  handleDuplicate: (showId: string) => void;
  handleDelete: (showId: string) => void;
}

export function MapList({
  shows,
  loading,
  isDefaultUnlocked,
  setIsDefaultUnlocked,
  setShowUnlockWarning,
  handleRename,
  onSelectShow,
  handleLink,
  handleDuplicate,
  handleDelete
}: MapListProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-[2px] max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
      {loading ? (
        <div className="text-white flex items-center justify-center gap-2 py-8">
          <Loader2 className="animate-spin" size={20} /> <span className="text-sm">{t('Loading...')}</span>
        </div>
      ) : shows.length === 0 ? (
        <div className="text-white/50 py-8 italic text-center text-sm">{t('No maps found. Create one below.')}</div>
      ) : (
        <>
          {shows.filter(s => s.id !== '_DEFAULT' && !s.isTemplate).map(show => {
            const isLocked = false;
            return (
              <div 
                key={show.id} 
                className={`flex items-center justify-between group bg-black p-3 transition-colors select-none text-white`}
                onDoubleClick={() => !isLocked && handleRename(show.id)}
              >
                <div className="flex items-center gap-3 pr-4 truncate min-w-0">
                  <div className={`font-mono text-sm truncate ${!isLocked ? 'cursor-text' : ''}`} title={show.title || show.id}>
                    {show.title || show.id}
                    <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wider">
                      {new Date(show.updatedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button 
                    onClick={() => !isLocked && onSelectShow(show.id)}
                    className={`transition-colors text-white/50 hover:text-white`}
                    title={t("Open Map")}
                  >
                    <Play size={16} />
                  </button>
                  <button 
                    onClick={() => handleLink(show.id)}
                    className="transition-colors text-white/50 hover:text-white"
                    title={t("Copy Link")}
                  >
                    <LinkIcon size={16} />
                  </button>
                  <button 
                    onClick={() => handleDuplicate(show.id)}
                    className="transition-colors text-white/50 hover:text-white"
                    title={t("Duplicate Map")}
                  >
                    <Copy size={16} />
                  </button>
                  <button 
                    onClick={() => !isLocked && handleDelete(show.id)}
                    className={`transition-colors text-white/50 hover:text-white`}
                    title={t("Delete Map")}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
          
          {shows.some(s => s.id === '_DEFAULT' || s.isTemplate) && (
            <details className="group mt-2">
              <summary className="bg-black/50 hover:bg-black/80 transition-colors p-3 flex items-center justify-between cursor-pointer select-none outline-none [&::-webkit-details-marker]:hidden border border-white/5">
                <div className="flex items-center gap-2 text-white/70 text-xs font-semibold tracking-wider uppercase">
                  <Folder size={14} className="group-open:hidden" />
                  <FolderOpen size={14} className="hidden group-open:block" />
                  {t('Templates')}
                </div>
                <ChevronDown size={14} className="text-white/50 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="flex flex-col gap-[2px] mt-[2px]">
                {shows.filter(s => s.id === '_DEFAULT' || s.isTemplate).map(show => {
                  const isLocked = !isDefaultUnlocked;
                  return (
                    <div 
                      key={show.id} 
                      className={`flex items-center justify-between group bg-black p-3 transition-colors select-none ${isLocked ? 'text-white/50' : 'text-white'}`}
                      onDoubleClick={() => !isLocked && handleRename(show.id)}
                    >
                      <div className="flex items-center gap-3 pr-4 truncate min-w-0">
                        <button 
                          onClick={() => isLocked ? setShowUnlockWarning(true) : setIsDefaultUnlocked(false)}
                          className="flex-shrink-0 transition-all hover:text-white"
                          title={isLocked ? t("Unlock template") : t("Lock template")}
                        >
                          {isLocked ? <Lock size={16} /> : <Unlock size={16} className="text-white" />}
                        </button>
                        <div className={`font-mono text-sm truncate ${!isLocked ? 'cursor-text' : ''}`} title={show.title || show.id}>
                          {show.title || show.id}
                          <div className="text-[10px] text-white/40 mt-1 uppercase tracking-wider">
                            {new Date(show.updatedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button 
                          onClick={() => !isLocked && onSelectShow(show.id)}
                          className={`transition-colors ${isLocked ? 'text-white/10 cursor-not-allowed' : 'text-white/50 hover:text-white'}`}
                          title={t("Open Map")}
                          disabled={isLocked}
                        >
                          <Play size={16} />
                        </button>
                        <button 
                          onClick={() => handleLink(show.id)}
                          className="transition-colors text-white/50 hover:text-white"
                          title={t("Copy Link")}
                        >
                          <LinkIcon size={16} />
                        </button>
                        <button 
                          onClick={() => handleDuplicate(show.id)}
                          className="transition-colors text-white/50 hover:text-white"
                          title={t("Duplicate Map")}
                        >
                          <Copy size={16} />
                        </button>
                        <button 
                          onClick={() => !isLocked && handleDelete(show.id)}
                          className={`transition-colors ${isLocked ? 'text-white/10 cursor-not-allowed' : 'text-white/50 hover:text-white'}`}
                          title={t("Delete Map")}
                          disabled={isLocked}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
