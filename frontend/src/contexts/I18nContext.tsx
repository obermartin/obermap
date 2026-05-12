import React, { createContext, useContext, useState, useEffect } from 'react';
import { de } from '../locales/de';

type Language = 'de' | 'en';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const dictionaries: Record<string, Record<string, string>> = {
  de
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('de');

  useEffect(() => {
    const saved = localStorage.getItem('obermap_language') as Language;
    if (saved && (saved === 'de' || saved === 'en')) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('obermap_language', lang);
  };

  const t = (key: string, replacements?: Record<string, string | number>) => {
    let text = key;
    if (language !== 'en' && dictionaries[language] && dictionaries[language][key]) {
      text = dictionaries[language][key];
    }
    
    if (replacements) {
      Object.keys(replacements).forEach(k => {
        text = text.replace(`{{${k}}}`, String(replacements[k]));
      });
    }
    return text;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};
