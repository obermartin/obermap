import React, { useEffect, useState, useRef } from 'react';
import { registerDialogListener, type DialogOptions } from '../utils/dialogService';
import { useTranslation } from '../contexts/I18nContext';

export const GlobalDialog: React.FC = () => {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerDialogListener((options) => {
      setDialog(options);
      if (options.type === 'prompt') {
        setInputValue(options.defaultValue || '');
      }
    });
  }, []);

  useEffect(() => {
    if (dialog?.type === 'prompt' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [dialog]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dialog) return;
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter') {
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog, inputValue]);

  if (!dialog) return null;

  const handleConfirm = () => {
    if (dialog.type === 'prompt') {
      dialog.resolve(inputValue);
    } else if (dialog.type === 'confirm') {
      dialog.resolve(true);
    } else {
      dialog.resolve(undefined);
    }
    setDialog(null);
  };

  const handleCancel = () => {
    if (dialog.type === 'prompt') {
      dialog.resolve(null);
    } else if (dialog.type === 'confirm') {
      dialog.resolve(false);
    } else {
      dialog.resolve(undefined);
    }
    setDialog(null);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
      <div className="bg-zinc-900 border border-white/10 p-6 flex flex-col gap-4 min-w-[350px] max-w-md shadow-2xl mx-4 w-full rounded-3xl">
        <h3 className="text-white font-semibold flex items-center gap-2 text-sm uppercase tracking-wider border-b border-white/10 pb-2">
          {dialog.type === 'alert' && t('ATTENTION')}
          {dialog.type === 'confirm' && t('CONFIRMATION REQUIRED')}
          {dialog.type === 'prompt' && t('INPUT REQUIRED')}
        </h3>
        <p className="text-white text-sm whitespace-pre-wrap">{dialog.message}</p>
        
        {dialog.type === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-black/60 border border-white/10 px-4 py-2 outline-none font-mono text-sm text-white focus:border-white/50 transition-colors rounded-full"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
        )}

        <div className="flex justify-end gap-2 mt-2 pt-4 border-t border-white/10">
          {dialog.type !== 'alert' && (
            <button
              onClick={handleCancel}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white text-sm transition-colors rounded-full"
            >
              {t('Cancel')}
            </button>
          )}
          <button
            onClick={handleConfirm}
            className="px-6 py-2 bg-white text-black hover:bg-white/90 text-sm transition-colors rounded-full"
          >
            {dialog.type === 'alert' ? t('OK') : t('Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
