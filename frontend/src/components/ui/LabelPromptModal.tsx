
import { useTranslation } from '../../contexts/I18nContext';

export interface LabelPromptModalProps {
  labelPrompt: { lngLat: [number, number], initialText?: string, initialSecondary?: string, annotationId?: string } | null;
  setLabelPrompt: (prompt: any) => void;
  labelInput: string;
  setLabelInput: (val: string) => void;
  secondaryLabelInput: string;
  setSecondaryLabelInput: (val: string) => void;
  activeTool: string;
}

export function LabelPromptModal({
  labelPrompt,
  setLabelPrompt,
  labelInput,
  setLabelInput,
  secondaryLabelInput,
  setSecondaryLabelInput,
  activeTool
}: LabelPromptModalProps) {
  const { t } = useTranslation();

  if (!labelPrompt) return null;

  const handleSave = () => {
    if (labelInput.trim()) {
      const event = new CustomEvent('saveLabel', { detail: { text: labelInput, secondaryText: secondaryLabelInput } });
      window.dispatchEvent(event);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
      <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl">
        <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">
          {labelPrompt.annotationId ? t("Edit Label") : t("Add Label")}
        </h3>
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            type="text"
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setLabelPrompt(null);
            }}
            placeholder={(activeTool === 'label' || labelPrompt.annotationId) ? t("Primary text...") : t("Enter text...")}
            className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
          />
          {(activeTool === 'label' || labelPrompt.annotationId) && (
            <input
              type="text"
              value={secondaryLabelInput}
              onChange={e => setSecondaryLabelInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setLabelPrompt(null);
              }}
              placeholder={t("Secondary text (optional)...")}
              className="w-full bg-black/60 border border-white/10 px-3 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
          <button 
            onClick={() => setLabelPrompt(null)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors rounded-full"
          >
            {t("Cancel")}
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 bg-white text-black hover:bg-white/90 text-sm transition-colors rounded-full"
          >
            {t("Save Label")}
          </button>
        </div>
      </div>
    </div>
  );
}
