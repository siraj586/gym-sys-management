import type { MemberStatus, MemberStatusCounts, PaymentSummary } from '@calisthenics/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useApi } from '../../api/useApi';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { errorMessage } from '../../features/auth/errorMessage';
import { useSettings } from '../../features/settings/SettingsContext';
import { formatDate, formatMoney } from '../../lib/format';

// The order the coach cares about: who needs attention comes right after who is fine.
const CARDS: { status: MemberStatus; accent: string }[] = [
  { status: 'ACTIVE', accent: 'text-lime' },
  { status: 'EXPIRING', accent: 'text-warn' },
  { status: 'EXPIRED', accent: 'text-danger' },
  { status: 'UPCOMING', accent: 'text-soft' },
  { status: 'NONE', accent: 'text-muted' },
];

/** This month's income and what members still owe, both linking to the payments page. */
function MoneySummary() {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const { data, error } = useApi<PaymentSummary>('/payments/summary');
  const money = (cents: number) => formatMoney(cents, currency, i18n.language);

  if (error) return <p className="text-danger">{errorMessage(error, t)}</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Link
        to="/admin/payments"
        className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-lime"
      >
        <span className="font-display text-4xl font-bold text-lime">
          {data ? money(data.monthIncomeCents) : '–'}
        </span>
        <span className="text-sm text-soft">{t('overview.monthIncome')}</span>
      </Link>
      <Link
        to="/admin/payments"
        className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-lime"
      >
        <span
          className={`font-display text-4xl font-bold ${data?.unpaidCount ? 'text-danger' : 'text-muted'}`}
        >
          {data ? money(data.unpaidCents) : '–'}
        </span>
        <span className="text-sm text-soft">
          {t('overview.unpaid', { count: data?.unpaidCount ?? 0 })}
        </span>
      </Link>
    </div>
  );
}

export function AdminHomePage() {
  const { t, i18n } = useTranslation();
  const { today } = useSettings();
  const { data: counts, error } = useApi<MemberStatusCounts>('/members/counts');

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">{t('admin.title')}</h1>
          <p className="text-muted">{formatDate(today, i18n.language)}</p>
        </div>
        <ButtonLink to="/admin/members/new">{t('members.add')}</ButtonLink>
      </div>

      <MoneySummary />

      {error ? (
        <p className="text-danger">{errorMessage(error, t)}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CARDS.map(({ status, accent }) => (
            <li key={status}>
              <Link
                to={`/admin/members?status=${status}`}
                className="flex h-full flex-col gap-1 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-lime"
              >
                <span className={`font-display text-4xl font-bold ${accent}`}>
                  {counts ? counts[status] : '–'}
                </span>
                <span className="text-sm text-soft">{t(`overview.${status}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
