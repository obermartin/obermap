import { useEffect, useState } from 'react';
import { GlobeCanvas } from './GlobeCanvas';
import { Play, Link as LinkIcon, Trash2, Plus, Loader2, Layers, Copy, Lock, Unlock, BookOpen, Globe } from 'lucide-react';
import { customAlert, customConfirm, customPrompt } from '../utils/dialogService';
import { useTranslation } from '../contexts/I18nContext';

interface Show {
  id: string;
  title: string;
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
    const newName = await customPrompt(t("Enter name for duplicate show:"), t("Copy of {{title}}", { title: oldTitle }));
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
    if (showId === '_DEFAULT' && !isDefaultUnlocked) return;
    
    const targetShow = shows.find(s => s.id === showId);
    const oldTitle = targetShow?.title || showId;
    const newName = await customPrompt(t("Enter new name for the show:"), oldTitle);
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
    if (showId === '_DEFAULT' && !isDefaultUnlocked) return;
    const targetShow = shows.find(s => s.id === showId);
    const title = targetShow?.title || showId;
    const confirmed = await customConfirm(t("Are you sure you want to delete the show \"{{title}}\"? This cannot be undone.", { title }));
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

  const handleCreateNew = () => {
    setShowPrompt(true);
    setNewShowName('');
  };

  const confirmCreateNew = () => {
    if (!newShowName.trim()) return;
    
    const title = newShowName.trim();
    const safeId = 'show_' + Date.now();
    
    setShowPrompt(false);
    
    fetch(`./api.php?show=_DEFAULT&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        data.settings = data.settings || {};
        data.settings.title = title;
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
                className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors bg-black/40 px-3 py-1.5 border border-white/10 text-xs font-semibold uppercase tracking-wider h-fit"
                title="Toggle Language"
              >
                <Globe size={14} /> {language.toUpperCase()}
              </button>
            </div>
          </div>

          <div className="text-white text-sm font-semibold flex items-center gap-2 pb-2 mb-2 uppercase tracking-wider">
            <Layers size={18} /> {t('Available Shows')}
          </div>

          <div className="flex flex-col gap-[2px] max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
            {loading ? (
              <div className="text-white flex items-center justify-center gap-2 py-8">
                <Loader2 className="animate-spin" size={20} /> <span className="text-sm">{t('Loading...')}</span>
              </div>
            ) : shows.length === 0 ? (
              <div className="text-white/50 py-8 italic text-center text-sm">{t('No shows found. Create one below.')}</div>
            ) : (
              shows.map(show => {
                const isDefault = show.id === '_DEFAULT';
                const isLocked = isDefault && !isDefaultUnlocked;
                
                return (
                  <div 
                    key={show.id} 
                    className={`flex items-center justify-between group bg-black p-3 transition-colors select-none ${isLocked ? 'text-white/50' : 'text-white'}`}
                    onDoubleClick={() => !isLocked && handleRename(show.id)}
                  >
                    <div className="flex items-center gap-3 pr-4 truncate min-w-0">
                      {isDefault && (
                        <button 
                          onClick={() => isLocked ? setShowUnlockWarning(true) : setIsDefaultUnlocked(false)}
                          className="flex-shrink-0 transition-all hover:text-white"
                          title={isLocked ? t("Unlock default template") : t("Lock default template")}
                        >
                          {isLocked ? <Lock size={16} /> : <Unlock size={16} className="text-white" />}
                        </button>
                      )}
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
                        title={t("Open Show")}
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
                        title={t("Duplicate Show")}
                      >
                        <Copy size={16} />
                      </button>
                      <button 
                        onClick={() => !isLocked && handleDelete(show.id)}
                        className={`transition-colors ${isLocked ? 'text-white/10 cursor-not-allowed' : 'text-white/50 hover:text-white'}`}
                        title={t("Delete Show")}
                        disabled={isLocked}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-2 pt-2 flex flex-col gap-2">
            <button 
              onClick={handleCreateNew}
              className="w-full py-2 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-sm transition-colors"
              title={t("Create New Show")}
            >
              <Plus size={16} /> {t('Create New Show')}
            </button>
            <a 
              href="/user_guide.html"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center gap-2 text-sm transition-colors"
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
          <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl">
            <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">{t('New Show Name')}</h3>
            <input
              autoFocus
              type="text"
              value={newShowName}
              onChange={e => setNewShowName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmCreateNew();
                if (e.key === 'Escape') setShowPrompt(false);
              }}
              placeholder={t("e.g. My_Awesome_Show")}
              className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
            />
            <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
              <button 
                onClick={() => setShowPrompt(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors uppercase font-semibold"
              >
                {t('Cancel')}
              </button>
              <button 
                onClick={confirmCreateNew}
                className="px-4 py-2 bg-white text-black hover:bg-white/90 text-sm transition-colors uppercase font-semibold tracking-wider"
              >
                {t('Create')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Unlock Warning Modal */}
      {showUnlockWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl">
            <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">
              <Unlock size={18} /> {t('Unlock Template')}
            </h3>
            <p className="text-white text-sm">
              <span dangerouslySetInnerHTML={{ __html: t('You are about to unlock the default template.') }} />
            </p>
            <p className="text-white/70 text-xs">
              {t('Any changes, edits, or deletions made to this show will directly affect the base template for all newly created shows in the future.')}
            </p>
            <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
              <button 
                onClick={() => setShowUnlockWarning(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors uppercase font-semibold"
              >
                {t('Cancel')}
              </button>
              <button 
                onClick={() => {
                  setIsDefaultUnlocked(true);
                  setShowUnlockWarning(false);
                }}
                className="px-4 py-2 bg-white text-black hover:bg-white/90 text-sm transition-colors uppercase font-semibold tracking-wider"
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
