import {
  type CheckInListResponse,
  type DashboardData,
  type MemberSummary,
} from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { BarChart } from '../../components/charts/BarChart';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card, CardRow } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { StatTile } from '../../components/ui/StatTile';
import { errorMessage } from '../../features/auth/errorMessage';
import { MemberPicker } from '../../features/members/MemberPicker';
import { useSettings } from '../../features/settings/SettingsContext';
import { endsText, formatDate, formatMoney, formatPeriod, formatTime } from '../../lib/format';

export function AdminHomePage() {
  const { t, i18n } = useTranslation();
  const { today, currency } = useSettings();
  const { data, error, reload } = useApi<DashboardData>('/dashboard');
  const money = (cents: number) => formatMoney(cents, currency, i18n.language);

  const longDate = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${today}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('admin.nav.dashboard')}
        meta={longDate}
        action={<ButtonLink to="/admin/members/new">{t('members.add')}</ButtonLink>}
      />

      {error ? (
        <p className="text-danger">{errorMessage(error, t)}</p>
      ) : !data ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3.5">
            <StatTile
              label={t('dashboard.totalMembers')}
              value={data.totalMembers}
              note={t('dashboard.joinedThisMonth', { count: data.joinedThisMonth })}
              to="/admin/members"
            />
            <StatTile
              label={t('dashboard.activeSubscriptions')}
              value={data.activeSubscriptions}
              note={t('dashboard.activeNote')}
              to="/admin/members?status=ACTIVE"
            />
            <StatTile
              label={t('dashboard.endingSoon')}
              value={data.endingSoon}
              note={t('dashboard.endingSoonNote')}
              tone={data.endingSoon ? 'warn' : 'fg'}
              to="/admin/members?status=EXPIRING"
            />
            <StatTile
              label={t('dashboard.expired')}
              value={data.expired}
              note={t('dashboard.expiredNote')}
              tone={data.expired ? 'danger' : 'fg'}
              to="/admin/members?status=EXPIRED"
            />
            <StatTile
              label={t('dashboard.collected')}
              value={money(data.collectedThisMonthCents)}
              note={t('dashboard.payments', { count: data.paymentsThisMonth })}
              to="/admin/payments"
            />
            <StatTile
              label={t('dashboard.checkInsToday')}
              value={data.checkInsToday}
              note={t('dashboard.soFar')}
              to="/admin/attendance"
            />
          </div>

          <div className="flex flex-wrap gap-[18px]">
            <Card
              className="flex-[1_1_380px]"
              title={t('dashboard.renewalsDue')}
              subtitle={t('dashboard.renewalsDueNote')}
            >
              {data.renewals.length === 0 ? (
                <p className="text-sm text-muted">{t('dashboard.noRenewals')}</p>
              ) : (
                data.renewals.slice(0, 6).map((r) => (
                  <CardRow key={r.memberId}>
                    <Link
                      to={`/admin/members?m=${r.memberId}`}
                      className="min-w-0 flex-[1_1_140px] hover:text-lime"
                    >
                      <span className="block font-semibold">
                        {r.firstName} {r.lastName}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatPeriod(r.startDate, r.endDate, i18n.language)}
                      </span>
                    </Link>
                    <Pill tone={r.daysLeft < 0 ? 'danger' : 'warn'}>
                      {endsText(t, today, r.endDate, i18n.language)}
                    </Pill>
                    <ButtonLink
                      variant="outline"
                      to={`/admin/payments?member=${r.memberId}`}
                      className="!px-3.5 text-[13px]"
                    >
                      {t('payments.renewAndRecord')}
                    </ButtonLink>
                  </CardRow>
                ))
              )}
              <Link to="/admin/members" className="self-start text-sm font-semibold text-lime">
                {t('dashboard.viewAllMembers')}
              </Link>
            </Card>

            <TodayCheckIns onChange={reload} />
          </div>

          <div className="flex flex-wrap gap-[18px]">
            <Card
              className="flex-[2_1_420px]"
              title={t('dashboard.revenue', { currency })}
              subtitle={t('dashboard.revenueNote')}
            >
              <BarChart
                label={t('dashboard.revenueLabel')}
                formatValue={(cents) => formatMoney(cents, currency, i18n.language)}
                bars={data.revenue.map((r, i) => ({
                  key: r.month,
                  label: new Intl.DateTimeFormat(i18n.language, {
                    month: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(`${r.month}-01T00:00:00Z`)),
                  value: r.cents,
                  highlight: i === data.revenue.length - 1,
                }))}
              />
            </Card>

            <Card className="flex-[1_1_300px]" title={t('dashboard.notPaid')}>
              {data.notPaid.length === 0 ? (
                <p className="text-sm text-muted">{t('payments.allPaid')}</p>
              ) : (
                data.notPaid.slice(0, 5).map((n) => (
                  <CardRow key={`${n.memberId}-${n.reason}-${n.subscriptionId ?? ''}`}>
                    <Link
                      to={`/admin/members?m=${n.memberId}`}
                      className="min-w-0 flex-1 hover:text-lime"
                    >
                      <span className="block font-semibold">
                        {n.firstName} {n.lastName}
                      </span>
                      <span className="block text-xs text-muted">
                        {n.reason === 'NEVER'
                          ? t('dashboard.neverPaid')
                          : n.reason === 'BALANCE'
                            ? t('dashboard.partlyPaid')
                            : t('dashboard.endedOn', {
                                date: formatDate(n.endDate!, i18n.language),
                              })}
                      </span>
                    </Link>
                    {n.amountCents !== null && (
                      <span
                        className="font-semibold text-warn"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {t('dashboard.due', { amount: money(n.amountCents) })}
                      </span>
                    )}
                  </CardRow>
                ))
              )}
              <Link to="/admin/payments" className="self-start text-sm font-semibold text-lime">
                {t('dashboard.openPayments')}
              </Link>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/** Check a member in without leaving the dashboard, and see who came today. */
function TodayCheckIns({ onChange }: { onChange: () => void }) {
  const { t, i18n } = useTranslation();
  const { today, timezone } = useSettings();
  const list = useApi<CheckInListResponse>('/check-ins');
  const [member, setMember] = useState<MemberSummary | null>(null);
  const [blocked, setBlocked] = useState<{ name: string; memberId: string; endDate: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Remount the picker after each check-in so it starts empty.
  const [round, setRound] = useState(0);

  const checkIn = async () => {
    if (!member) {
      setError(t('attendance.pickMember'));
      return;
    }
    setError(null);
    setBlocked(null);
    setBusy(true);
    try {
      await apiFetch('/check-ins', { method: 'POST', body: { memberId: member.id } });
      setMember(null);
      setRound((r) => r + 1);
      list.reload();
      onChange();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_ACTIVE_SUBSCRIPTION') {
        const { lastEndDate } = err.details as { lastEndDate: string | null };
        setBlocked({ name: member.firstName, memberId: member.id, endDate: lastEndDate });
      } else {
        setError(errorMessage(err, t));
      }
    } finally {
      setBusy(false);
    }
  };

  const checkIns = list.data?.checkIns ?? [];
  return (
    <Card
      className="flex-[1_1_380px]"
      title={t('attendance.today')}
      subtitle={t('attendance.anyTime')}
    >
      <div className="flex items-start gap-2">
        <MemberPicker
          key={round}
          label={t('attendance.search')}
          hideLabel
          placeholder={t('attendance.searchPlaceholder')}
          selected={member}
          onSelect={(m) => {
            setMember(m);
            setBlocked(null);
            setError(null);
          }}
        />
        <Button disabled={busy} onClick={() => void checkIn()}>
          {t('attendance.checkIn')}
        </Button>
      </div>
      {blocked && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-danger-wash px-3 py-2.5 text-[13px] text-danger-soft">
          <span className="flex-1">
            {blocked.endDate
              ? t('attendance.blockedEnded', {
                  name: blocked.name,
                  date: formatDate(blocked.endDate, i18n.language),
                })
              : t('attendance.blockedNever', { name: blocked.name })}
          </span>
          <Link
            to={`/admin/payments?member=${blocked.memberId}`}
            className="font-semibold text-fg underline"
          >
            {t('payments.renewAndRecord')}
          </Link>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {checkIns.length === 0 && list.data && (
        <p className="text-sm text-muted">{t('attendance.nobodyYet')}</p>
      )}
      {checkIns.slice(0, 5).map((c) => (
        <CardRow key={c.id}>
          <span
            className="w-14 font-semibold text-lime"
            dir="ltr"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatTime(c.checkedInAt, i18n.language, timezone)}
          </span>
          <span className="min-w-0 flex-1 font-semibold">
            {c.member.firstName} {c.member.lastName}
          </span>
          {c.member.paidThrough && (
            <span className="text-xs text-muted">
              {endsText(t, today, c.member.paidThrough, i18n.language)}
            </span>
          )}
        </CardRow>
      ))}
      {checkIns.length > 0 && (
        <Link to="/admin/attendance" className="self-start text-sm font-semibold text-lime">
          {t('attendance.viewAll', { count: checkIns.length })}
        </Link>
      )}
    </Card>
  );
}
