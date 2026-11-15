import {
  PAYMENT_METHODS,
  type PaymentListResponse,
  type UnpaidSubscription,
} from '@calisthenics/shared';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../../api/useApi';
import { errorMessage } from '../../features/auth/errorMessage';
import { useSettings } from '../../features/settings/SettingsContext';
import { formatDate, formatMoney } from '../../lib/format';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function PaymentsPage() {
  const { t } = useTranslation();
  const { today } = useSettings();
  const [params, setParams] = useSearchParams();
  const requested = params.get('month') ?? '';
  const month = MONTH.test(requested) ? requested : today.slice(0, 7);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-bold uppercase">{t('payments.title')}</h1>
          <label className="flex flex-col gap-1.5 text-sm text-soft">
            {t('payments.month')}
            <input
              type="month"
              value={month}
              max={today.slice(0, 7)}
              onChange={(e) =>
                MONTH.test(e.target.value) &&
                setParams({ month: e.target.value }, { replace: true })
              }
              className="min-h-11 rounded-md border border-line bg-surface px-3 text-fg outline-none focus:border-lime"
            />
          </label>
        </div>
        <MonthIncome month={month} />
      </section>

      <Unpaid />
    </div>
  );
}

function MonthIncome({ month }: { month: string }) {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const { data, error, loading } = useApi<PaymentListResponse>(`/payments?month=${month}`);
  const money = (cents: number) => formatMoney(cents, currency, i18n.language);

  if (error) return <p className="text-danger">{errorMessage(error, t)}</p>;
  if (!data) return <p className="text-muted">{t('common.loading')}</p>;

  return (
    <div className={`flex flex-col gap-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <dt className="text-sm text-soft">{t('payments.monthTotal')}</dt>
          <dd className="font-display text-4xl font-bold text-lime">{money(data.totalCents)}</dd>
        </div>
        {PAYMENT_METHODS.map((m) => (
          <div key={m} className="rounded-lg border border-line bg-surface p-4">
            <dt className="text-sm text-soft">{t(`paymentMethod.${m}`)}</dt>
            <dd className="font-display text-4xl font-bold">{money(data.byMethod[m])}</dd>
          </div>
        ))}
      </dl>

      {data.payments.length === 0 ? (
        <p className="rounded-lg border border-line p-6 text-center text-muted">
          {t('payments.noneThisMonth')}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {data.payments.map((p) => (
            <li
              key={p.id}
              className="grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[7rem_1fr_auto] sm:items-center"
            >
              <span className="text-sm text-soft">{formatDate(p.paidAt, i18n.language)}</span>
              <span className="flex flex-col">
                <Link
                  to={`/admin/members/${p.member.id}`}
                  className="font-semibold hover:text-lime"
                >
                  {p.member.firstName} {p.member.lastName}
                </Link>
                <span className="text-sm text-muted">
                  {p.planName} · {t(`paymentMethod.${p.method}`)}
                  {p.voidedAt && ` · ${t('payments.voided', { reason: p.voidReason ?? '' })}`}
                </span>
              </span>
              <span className={p.voidedAt ? 'text-muted line-through' : 'font-semibold'}>
                {money(p.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Unpaid() {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const { data, error } = useApi<{ subscriptions: UnpaidSubscription[] }>('/payments/unpaid');
  const money = (cents: number) => formatMoney(cents, currency, i18n.language);
  const total = data?.subscriptions.reduce((sum, s) => sum + s.balanceCents, 0) ?? 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-3xl font-bold uppercase">{t('payments.unpaidTitle')}</h2>
        {data && data.subscriptions.length > 0 && (
          <span className="font-semibold text-danger">
            {t('payments.unpaidTotal', { amount: money(total) })}
          </span>
        )}
      </div>
      {error ? (
        <p className="text-danger">{errorMessage(error, t)}</p>
      ) : !data ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : data.subscriptions.length === 0 ? (
        <p className="rounded-lg border border-line p-6 text-center text-muted">
          {t('payments.allPaid')}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {data.subscriptions.map((s) => (
            <li key={s.subscriptionId}>
              <Link
                to={`/admin/members/${s.member.id}`}
                className="grid gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <span className="flex flex-col">
                  <span className="font-semibold">
                    {s.member.firstName} {s.member.lastName}
                  </span>
                  <span className="text-sm text-muted">
                    {s.planName} ·{' '}
                    {t('subscriptions.period', {
                      start: formatDate(s.startDate, i18n.language),
                      end: formatDate(s.endDate, i18n.language),
                    })}
                  </span>
                </span>
                <span className="flex flex-col text-sm sm:items-end">
                  <span className="font-semibold text-danger">{money(s.balanceCents)}</span>
                  <span className="text-muted">
                    {t('payments.paidOf', { paid: money(s.paidCents), price: money(s.priceCents) })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
