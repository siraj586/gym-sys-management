import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-3 p-6">
      <h1 className="font-display text-4xl font-bold uppercase">{t('notFound.title')}</h1>
      <Link to="/" className="font-semibold text-lime">
        {t('notFound.back')}
      </Link>
    </section>
  );
}
