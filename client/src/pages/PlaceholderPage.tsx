import { useTranslation } from 'react-i18next';

type Props = { titleKey: 'login.title' | 'admin.title' | 'portal.title' };

/** Stands in for pages that later phases replace one by one. */
export function PlaceholderPage({ titleKey }: Props) {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-3">
      <h1 className="font-display text-4xl font-bold uppercase">{t(titleKey)}</h1>
      <p className="text-muted">{t('placeholder.note')}</p>
    </section>
  );
}
