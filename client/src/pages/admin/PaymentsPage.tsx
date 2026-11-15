import type { NotPaid, PaymentListItem, PaymentListResponse } from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { FilterChips } from '../../components/ui/FilterChips';
import { Pill } from '../../components/ui/Pill';
import { StatTile } from '../../components/ui/StatTile';
import { errorMessage } from '../../features/auth/errorMessage';
import { RenewForm } from '../../features/payments/RenewForm';
import { useSettings } from '../../features/settings/SettingsContext';
import { formatDate, formatMoney, formatPeriod } from '../../lib/format';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
type Filter = 'ALL' | 'PAID' | 'NOT_PAID';

/** One row of the table: a payment received, or someone who still owes. */
type Row = { kind: 'paid'; payment: PaymentListItem } | { kind: 'due'; due: NotPaid };

export function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const { today, currency } = useSettings();
  const [params, setParams] = useSearchParams();
  const requested = params.get('month') ?? '';
  const currentMonth = today.slice(0, 7);
  const month = MONTH.test(requested) && requested <= currentMonth ? requested : currentMonth;
  const filter = (['PAID', 'NOT_PAID'] as string[]).includes(params.get('show') ?? '')
    ? (params.get('show') as Filter)
    : 'ALL';
  const presetMember = params.get('member');

  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const payments = useApi<PaymentListResponse>(`/payments?month=${month}`);
  const owing = useApi<{ notPaid: NotPaid[] }>('/dashboard/not-paid');
  const [actionError, setActionError] = useState<string | null>(null);
  const money = (cents: number) => formatMoney(cents, currency, i18n.language);

  const reload = () => {
    payments.reload();
    owing.reload();
  };

  // Who owes is the state today, so it belongs to the current month's view only.
  const dueRows: Row[] =
    month === currentMonth ? (owing.data?.notPaid ?? []).map((due) => ({ kind: 'due', due })) : [];
  const paidRows: Row[] = (payments.data?.payments ?? []).map((payment) => ({
    kind: 'paid',
    payment,
  }));
  const rows =
    filter === 'PAID' ? paidRows : filter === 'NOT_PAID' ? dueRows : [...paidRows, ...dueRows];

  const notPaidCents = (owing.data?.notPaid ?? []).reduce((s, n) => s + (n.amountCents ?? 0), 0);
  const owingMembers = new Set((owing.data?.notPaid ?? []).map((n) => n.memberId)).size;
  const paidCount = paidRows.filter((r) => r.kind === 'paid' && !r.payment.voidedAt).length;
  const monthName = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));

  const voidPayment = async (p: PaymentListItem) => {
    const reason = window.prompt(t('payments.voidReason'));
    if (reason === null) return;
    if (!reason.trim()) {
      setActionError(t('validation.required'));
      return;
    }
    setActionError(null);
    try {
      await apiFetch(`/payments/${p.id}/void`, { method: 'POST', body: { reason } });
      reload();
    } catch (err) {
      setActionError(errorMessage(err, t));
    }
  };

  const exportCsv = () => {
    const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = [
      t('payments.col.member'),
      t('payments.col.month'),
      t('payments.col.amount'),
      t('payments.col.method'),
      t('payments.col.date'),
      t('payments.col.status'),
    ];
    const lines = rows.map((r) =>
      r.kind === 'paid'
        ? [
            `${r.payment.member.firstName} ${r.payment.member.lastName}`,
            `${r.payment.period.startDate} – ${r.payment.period.endDate}`,
            (r.payment.amountCents / 100).toFixed(2),
            t(`paymentMethod.${r.payment.method}`),
            r.payment.paidAt,
            r.payment.voidedAt ? t('payments.voidedShort') : t('paymentStatus.PAID'),
          ]
        : [
            `${r.due.firstName} ${r.due.lastName}`,
            r.due.endDate ?? '',
            r.due.amountCents === null ? '' : (r.due.amountCents / 100).toFixed(2),
            '',
            '',
            t('paymentStatus.UNPAID'),
          ],
    );
    // The BOM makes Excel read the Arabic names correctly.
    const csv = '﻿' + [header, ...lines].map((l) => l.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-start gap-[22px]">
      <section className="flex min-w-0 flex-[3_1_520px] flex-col gap-4">
        <PageHeader
          title={t('payments.title')}
          action={
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              {t('payments.exportCsv')}
            </Button>
          }
        />

        <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
          <StatTile
            label={t('payments.incomeIn', { month: monthName })}
            value={payments.data ? money(payments.data.totalCents) : '–'}
            note={t('payments.paidCount', { count: paidCount })}
          />
          <StatTile
            label={t('payments.notPaid')}
            value={owing.data ? money(notPaidCents) : '–'}
            tone={notPaidCents > 0 ? 'warn' : 'fg'}
            note={t('payments.owingMembers', { count: owingMembers })}
          />
          <StatTile
            label={`${t('paymentMethod.CASH')} / ${t('paymentMethod.WHISH_MONEY')}`}
            value={
              payments.data
                ? `${money(payments.data.byMethod.CASH)} / ${money(payments.data.byMethod.WHISH_MONEY)}`
                : '–'
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChips
            label={t('payments.filter')}
            value={filter}
            onChange={(f) => setParam('show', f === 'ALL' ? null : f)}
            options={[
              { value: 'ALL', label: t('payments.show.ALL') },
              { value: 'PAID', label: t('payments.show.PAID') },
              { value: 'NOT_PAID', label: t('payments.show.NOT_PAID') },
            ]}
          />
          <label className="ms-auto flex items-center gap-2 text-[13px] text-soft">
            {t('payments.month')}
            <input
              type="month"
              value={month}
              max={currentMonth}
              onChange={(e) =>
                MONTH.test(e.target.value) &&
                setParam('month', e.target.value === currentMonth ? null : e.target.value)
              }
              className="min-h-11 rounded-md border border-line bg-surface px-3 text-fg outline-none focus:border-lime"
            />
          </label>
        </div>

        {actionError && (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        )}
        {payments.error || owing.error ? (
          <p className="text-danger">{errorMessage(payments.error ?? owing.error, t)}</p>
        ) : !payments.data ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-line p-6 text-center text-muted">
            {t(filter === 'NOT_PAID' ? 'payments.allPaid' : 'payments.noneThisMonth')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface px-5 pb-3 pt-1.5">
            <table
              className="w-full min-w-[640px] border-collapse"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-3 pe-2 text-start font-medium">{t('payments.col.member')}</th>
                  <th className="px-2 py-3 text-start font-medium">{t('payments.col.month')}</th>
                  <th className="px-2 py-3 text-end font-medium">{t('payments.col.amount')}</th>
                  <th className="px-2 py-3 text-start font-medium">{t('payments.col.method')}</th>
                  <th className="px-2 py-3 text-start font-medium">{t('payments.col.date')}</th>
                  <th className="py-3 ps-2 text-start font-medium">{t('payments.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) =>
                  r.kind === 'paid' ? (
                    <tr key={r.payment.id} className="border-t border-line">
                      <td className="whitespace-nowrap py-3 pe-2 font-semibold">
                        <Link
                          to={`/admin/members?m=${r.payment.member.id}`}
                          className="hover:text-lime"
                        >
                          {r.payment.member.firstName} {r.payment.member.lastName}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-soft">
                        {formatPeriod(
                          r.payment.period.startDate,
                          r.payment.period.endDate,
                          i18n.language,
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-2 py-3 text-end ${r.payment.voidedAt ? 'text-muted line-through' : ''}`}
                      >
                        {money(r.payment.amountCents)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-soft">
                        {t(`paymentMethod.${r.payment.method}`)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-soft">
                        {formatDate(r.payment.paidAt, i18n.language)}
                      </td>
                      <td className="py-3 ps-2">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          {r.payment.voidedAt ? (
                            <Pill tone="neutral">{t('payments.voidedShort')}</Pill>
                          ) : (
                            <>
                              <Pill tone="lime">{t('paymentStatus.PAID')}</Pill>
                              <button
                                type="button"
                                onClick={() => void voidPayment(r.payment)}
                                className="min-h-11 px-1 text-xs text-muted hover:text-danger"
                              >
                                {t('payments.void')}
                              </button>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={`due-${r.due.memberId}-${r.due.reason}-${r.due.subscriptionId ?? ''}`}
                      className="border-t border-line"
                    >
                      <td className="whitespace-nowrap py-3 pe-2 font-semibold">
                        <Link to={`/admin/members?m=${r.due.memberId}`} className="hover:text-lime">
                          {r.due.firstName} {r.due.lastName}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-soft">
                        {r.due.reason === 'NEVER'
                          ? t('members.notStarted')
                          : r.due.reason === 'BALANCE'
                            ? t('dashboard.partlyPaid')
                            : t('payments.ended', {
                                date: formatDate(r.due.endDate!, i18n.language),
                              })}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-end">
                        {r.due.amountCents === null
                          ? '—'
                          : t('dashboard.due', { amount: money(r.due.amountCents) })}
                      </td>
                      <td className="px-2 py-3 text-muted">—</td>
                      <td className="px-2 py-3 text-muted">—</td>
                      <td className="py-3 ps-2">
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <Pill tone="danger">{t('paymentStatus.UNPAID')}</Pill>
                          {r.due.reason === 'BALANCE' ? (
                            <Link
                              to={`/admin/members/${r.due.memberId}`}
                              className="text-xs text-lime"
                            >
                              {t('payments.record')}
                            </Link>
                          ) : (
                            <Link
                              to={`?member=${r.due.memberId}`}
                              replace
                              className="text-xs text-lime"
                            >
                              {t('payments.renewShort')}
                            </Link>
                          )}
                        </span>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">{t('payments.neverDeleted')}</p>
      </section>

      <section className="min-w-0 flex-[1_1_280px] rounded-lg border border-line bg-surface p-5">
        <RenewForm key={presetMember ?? 'none'} initialMemberId={presetMember} onSaved={reload} />
      </section>
    </div>
  );
}
