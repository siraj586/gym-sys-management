import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ar from './locales/ar.json';
import en from './locales/en.json';

export const LANGUAGES = ['en', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'language';

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language);
}

/** Saved choice first, then the browser language, then English. */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Storage can be blocked (private mode); fall through to the browser language.
  }
  return navigator.language.startsWith('ar') ? 'ar' : 'en';
}

/** Arabic reads right to left, so the whole document flips with the language. */
function applyToDocument(language: string) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
}

i18n.on('languageChanged', (language) => {
  applyToDocument(language);
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not being able to remember the choice is not an error worth showing.
  }
});

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes text
});

applyToDocument(i18n.language);

export default i18n;
