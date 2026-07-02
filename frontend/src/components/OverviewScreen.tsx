import { useEffect, useState } from 'react';
import { GlobeCanvas } from './GlobeCanvas';
import { Play, Link as LinkIcon, Trash2, Plus, Loader2, Layers, Copy, Lock, Unlock, BookOpen, Globe, Folder, FolderOpen, ChevronDown } from 'lucide-react';
import { customAlert, customConfirm, customPrompt } from '../utils/dialogService';
import { useTranslation } from '../contexts/I18nContext';

interface Show {
  id: string;
  title: string;
  isTemplate?: boolean;
  previewData?: string;
  updatedAt: string;
}

interface OverviewScreenProps {
  onSelectShow: (showId: string) => void;
}

export function OverviewScreen({ onSelectShow }: OverviewScreenProps) {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const { t, language, setLanguage } = useTranslation();

  const fetchShows = () => {
    setLoading(true);
    fetch(`./api.php?action=list_shows&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setShows(data);
        }
      })
      .catch(err => console.error('Error fetching shows:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchShows();
  }, []);

  const handleLink = async (showId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?show=${showId}`;
    navigator.clipboard.writeText(url).then(async () => {
      await customAlert(t('Link copied to clipboard:\n{{url}}', { url }));
    });
  };

  const [isDefaultUnlocked, setIsDefaultUnlocked] = useState(false);
  const [showUnlockWarning, setShowUnlockWarning] = useState(false);

  const handleDuplicate = async (showId: string) => {
    const targetShow = shows.find(s => s.id === showId);
    const oldTitle = targetShow?.title || showId;
    const newName = await customPrompt(t("Enter name for duplicate map:"), t("Copy of {{title}}", { title: oldTitle }));
    if (!newName) return;
    const safeId = 'show_' + Date.now();
    
    fetch(`./api.php?show=${showId}&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        data.settings = data.settings || {};
        data.settings.title = newName.trim();
        return fetch(`./api.php?show=${safeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      })
      .then(() => fetchShows())
      .catch(err => console.error('Error duplicating show:', err));
  };

  const handleRename = async (showId: string) => {
    const targetShow = shows.find(s => s.id === showId);
    if ((showId === '_DEFAULT' || targetShow?.isTemplate) && !isDefaultUnlocked) return;
    
    const oldTitle = targetShow?.title || showId;
    const newName = await customPrompt(t("Enter new name for the map:"), oldTitle);
    if (!newName || newName.trim() === oldTitle) return;

    fetch(`./api.php?show=${showId}&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        data.settings = data.settings || {};
        data.settings.title = newName.trim();
        return fetch(`./api.php?show=${showId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      })
      .then(() => fetchShows())
      .catch(err => console.error('Error renaming show:', err));
  };

  const handleDelete = async (showId: string) => {
    const targetShow = shows.find(s => s.id === showId);
    if ((showId === '_DEFAULT' || targetShow?.isTemplate) && !isDefaultUnlocked) return;
    const title = targetShow?.title || showId;
    const confirmed = await customConfirm(t("Are you sure you want to delete the map \"{{title}}\"? This cannot be undone.", { title }));
    if (confirmed) {
      fetch(`./api.php?action=delete_show&show=${showId}`, { method: 'POST' })
        .then(res => res.json())
        .then(() => {
          fetchShows();
        })
        .catch(err => console.error('Error deleting show:', err));
    }
  };

  const [showPrompt, setShowPrompt] = useState(false);
  const [newShowName, setNewShowName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('_DEFAULT');

  const handleCreateNew = () => {
    setShowPrompt(true);
    setNewShowName('');
    setSelectedTemplateId('_DEFAULT');
  };

  const confirmCreateNew = () => {
    if (!newShowName.trim()) return;
    
    const title = newShowName.trim();
    const safeId = 'show_' + Date.now();
    
    setShowPrompt(false);
    
    fetch(`./api.php?show=${selectedTemplateId}&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        data.settings = data.settings || {};
        data.settings.title = title;
        data.settings.isTemplate = false;
        data.settings.previewData = null;
        return fetch(`./api.php?show=${safeId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      })
      .then(() => onSelectShow(safeId))
      .catch(err => console.error('Error creating show:', err));
  };

  return (
    <div className="w-dvw h-dvh bg-black relative overflow-hidden flex flex-col items-center">
      <GlobeCanvas />

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6">
        
        {/* Panel */}
        <div className="relative z-10 w-full max-w-2xl bg-zinc-900 border border-white/10 shadow-2xl p-6 pointer-events-auto flex flex-col gap-4">
          {/* Logo */}
          <div className="flex justify-between items-start mb-2">
            <div className="w-24"></div> {/* Spacer for center alignment */}
            <img src="/obermapstudio.svg" alt="Obermap Studio" className="h-36 w-auto" />
            <div className="w-24 flex justify-end">
              <button 
                onClick={() => setLanguage(language === 'en' ? 'de' : 'en')}
                className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors bg-black/40 px-3 py-1.5 border border-white/10 text-xs font-semibold uppercase tracking-wider h-fit rounded-full"
                title="Toggle Language"
              >
                <Globe size={14} /> {language.toUpperCase()}
              </button>
            </div>
          </div>

          <div className="text-white text-sm font-semibold flex items-center gap-2 pb-2 mb-2 uppercase tracking-wider">
            <Layers size={18} /> {t('Available Maps')}
          </div>

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

          <div className="mt-2 pt-2 flex flex-col gap-2">
            <button 
              onClick={handleCreateNew}
              className="w-full py-2 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
              title={t("Create New Map")}
            >
              <Plus size={16} /> {t('Create New Map')}
            </button>
            <a 
              href="/user_guide.html"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-sm transition-colors rounded-full"
              title={t("User Guide")}
            >
              <BookOpen size={16} /> {t('User Guide')}
            </a>
          </div>
        </div>
      </div>

      {/* New Show Prompt Modal */}
      {showPrompt && (
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
      )}
      {/* Unlock Warning Modal */}
      {showUnlockWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl rounded-3xl mx-4">
            <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">
              <Unlock size={18} /> {t('Unlock Template')}
            </h3>
            <p className="text-white text-sm">
              <span dangerouslySetInnerHTML={{ __html: t('You are about to unlock the default template.') }} />
            </p>
            <p className="text-white/70 text-xs">
              {t('Any changes, edits, or deletions made to this map will directly affect the base template for all newly created maps in the future.')}
            </p>
            <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
              <button 
                onClick={() => setShowUnlockWarning(false)}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors rounded-full"
              >
                {t('Cancel')}
              </button>
              <button 
                onClick={() => {
                  setIsDefaultUnlocked(true);
                  setShowUnlockWarning(false);
                }}
                className="px-6 py-2 bg-white text-black hover:bg-white/90 text-sm transition-colors rounded-full"
              >
                {t('Unlock')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
