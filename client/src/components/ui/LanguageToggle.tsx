import { useTranslation } from 'react-i18next';

/** "EN | ع": both languages visible, the current one bright. One click switches. */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(isArabic ? 'en' : 'ar')}
      aria-label={t('language.switch')}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] transition-colors hover:border-lime ${className}`}
    >
      {/* Always EN first and ع second, whatever the page direction. */}
      <span dir="ltr" className="inline-flex gap-1.5">
        <span className={isArabic ? 'text-muted' : 'font-semibold text-fg'}>EN</span>
        <span aria-hidden="true" className="text-muted">
          |
        </span>
        <span className={isArabic ? 'font-semibold text-fg' : 'text-muted'}>ع</span>
      </span>
    </button>
  );
}
