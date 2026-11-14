import { useTranslation } from 'react-i18next';

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const next = i18n.language === 'ar' ? 'en' : 'ar';

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(next)}
      className="min-h-11 rounded-full border border-line px-4 text-sm text-fg transition-colors hover:border-lime"
    >
      {t('language.switchTo')}
    </button>
  );
}
