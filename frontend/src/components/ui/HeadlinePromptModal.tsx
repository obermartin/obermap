
import { useTranslation } from '../../contexts/I18nContext';

export interface HeadlinePromptModalProps {
  headlinePrompt: { id?: string, initialPrimary?: string, initialSecondary?: string } | null;
  setHeadlinePrompt: (prompt: any) => void;
  headlineInput: string;
  setHeadlineInput: (val: string) => void;
  highlightedLineInput: string;
  setHighlightedLineInput: (val: string) => void;
}

export function HeadlinePromptModal({
  headlinePrompt,
  setHeadlinePrompt,
  headlineInput,
  setHeadlineInput,
  highlightedLineInput,
  setHighlightedLineInput
}: HeadlinePromptModalProps) {
  const { t } = useTranslation();

  if (!headlinePrompt) return null;

  const handleSave = () => {
    if (headlineInput.trim() || highlightedLineInput.trim()) {
      const event = new CustomEvent('saveHeadline', { detail: { text: headlineInput, secondaryText: highlightedLineInput, id: headlinePrompt.id } });
      window.dispatchEvent(event);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
      <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl">
        <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">
          {headlinePrompt.id ? t("Edit Headline") : t("Add Headline")}
        </h3>
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            type="text"
            value={headlineInput}
            onChange={e => setHeadlineInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setHeadlinePrompt(null);
            }}
            placeholder={t("Headline (e.g. TRAGÖDIE IN BERLIN)...")}
            className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
          />
          <input
            type="text"
            value={highlightedLineInput}
            onChange={e => setHighlightedLineInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setHeadlinePrompt(null);
            }}
            placeholder={t("Highlighted sub-line (optional)...")}
            className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
          />
        </div>
        <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
          <button 
            onClick={() => setHeadlinePrompt(null)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors rounded-full"
          >
            {t("Cancel")}
          </button>
          <button 
            onClick={handleSave}
            disabled={!headlineInput.trim() && !highlightedLineInput.trim()}
            className="px-4 py-2 bg-white text-black hover:bg-white/90 text-sm font-semibold transition-colors rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
