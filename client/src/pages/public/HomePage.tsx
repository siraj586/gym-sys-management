import { useTranslation } from 'react-i18next';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <section className="flex max-w-2xl flex-col gap-5">
      <h1 className="font-display text-6xl font-bold uppercase leading-none sm:text-7xl">
        {t('home.title')}
      </h1>
      <p className="text-lg text-muted">{t('home.subtitle')}</p>
    </section>
  );
}
