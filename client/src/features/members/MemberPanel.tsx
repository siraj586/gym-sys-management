import {
  currentPeriod,
  daysBetween,
  type MemberAttendance,
  type MemberDetail,
  type MemberProgramResponse,
  type MemberProgress,
} from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card, CardRow } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { endsText, formatDate, formatMoney } from '../../lib/format';
import { errorMessage } from '../auth/errorMessage';
import { useSettings } from '../settings/SettingsContext';

/** One member at a glance: who, their month, program, visits and progress. */
export function MemberPanel({ memberId, onChanged }: { memberId: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const { today, currency } = useSettings();
  const member = useApi<MemberDetail>(`/members/${memberId}`);
  const [actionError, setActionError] = useState<string | null>(null);

  if (member.error) return <p className="text-danger">{errorMessage(member.error, t)}</p>;
  if (!member.data) return <p className="text-muted">{t('common.loading')}</p>;
  const m = member.data;
  const money = (cents: number) => formatMoney(cents, currency, i18n.language);

  const toggleArchive = async () => {
    const archiving = !m.archivedAt;
    if (archiving && !window.confirm(t('members.confirmArchive'))) return;
    setActionError(null);
    try {
      await apiFetch(`/members/${m.id}/${archiving ? 'archive' : 'restore'}`, { method: 'POST' });
      member.reload();
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err, t));
    }
  };

  const sub = currentPeriod(m.subscriptions, today);
  const lastPayment = sub?.payments.find((p) => !p.voidedAt);
  const total = sub ? Math.max(1, daysBetween(sub.startDate, sub.endDate)) : 1;
  const used = sub ? Math.min(total, Math.max(0, daysBetween(sub.startDate, today))) : 0;
  const memberSince = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(m.createdAt));

  return (
    <>
      <Card>
        <h2 className="text-[22px] font-semibold">
          {m.firstName} {m.lastName}
        </h2>
        <p className="text-muted">
          <span dir="ltr">{m.phone}</span>
          {m.email && <> · {m.email}</>}
        </p>
        <p className="text-xs text-muted">
          {t('members.since', { date: memberSince })} ·{' '}
          {t(m.hasAccount ? 'members.hasAccount' : 'members.noAccount')}
        </p>
        {(m.coachNotes || m.healthNotes) && (
          <p className="whitespace-pre-wrap text-[13px] text-soft">
            <span className="text-muted">{t('members.coachOnlyNotes')}: </span>
            {[m.healthNotes, m.coachNotes].filter(Boolean).join('\n')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="outline" to={`/admin/members/${m.id}/edit`}>
            {t('common.edit')}
          </ButtonLink>
          <Button
            variant="outline"
            className="!border-line !text-soft"
            onClick={() => void toggleArchive()}
          >
            {t(m.archivedAt ? 'members.restore' : 'members.archive')}
          </Button>
        </div>
        {actionError && (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        )}
      </Card>

      <Card
        accent={m.status === 'ACTIVE' || m.status === 'EXPIRING'}
        title={t('members.subscription')}
        action={
          sub && m.status !== 'NONE' ? (
            m.status === 'EXPIRING' || m.status === 'EXPIRED' ? (
              <Pill tone={m.status === 'EXPIRED' ? 'danger' : 'warn'}>
                {endsText(t, today, sub.endDate, i18n.language)}
              </Pill>
            ) : (
              <StatusBadge status={m.status} />
            )
          ) : undefined
        }
      >
        {sub ? (
          <>
            <p className="text-lg font-semibold">
              {sub.planName} · {money(sub.priceCents)}
            </p>
            <div
              role="img"
              aria-label={t('members.daysUsed', { used, total })}
              className="h-2.5 overflow-hidden rounded-sm bg-line"
            >
              <div className="h-full bg-lime" style={{ width: `${(used / total) * 100}%` }} />
            </div>
            <p className="text-[13px] text-soft">
              {t('subscriptions.period', {
                start: formatDate(sub.startDate, i18n.language),
                end: formatDate(sub.endDate, i18n.language),
              })}
            </p>
            <p className="text-[13px] text-muted">
              {lastPayment
                ? t('members.paidOn', {
                    amount: money(lastPayment.amountCents),
                    method: t(`paymentMethod.${lastPayment.method}`),
                    date: formatDate(lastPayment.paidAt, i18n.language),
                  })
                : t('members.notPaidYet')}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">{t('subscriptions.empty')}</p>
        )}
        {!m.archivedAt && (
          <ButtonLink to={`/admin/payments?member=${m.id}`} className="self-start">
            {t('payments.renewAndRecord')}
          </ButtonLink>
        )}
        <Link to={`/admin/members/${m.id}`} className="self-start text-[13px] text-lime">
          {t('members.history')}
        </Link>
      </Card>

      <div className="flex flex-wrap gap-3.5">
        <ProgramCard memberId={m.id} />
        <AttendanceCard memberId={m.id} />
      </div>

      <ProgressCard memberId={m.id} />
    </>
  );
}

function ProgramCard({ memberId }: { memberId: string }) {
  const { t, i18n } = useTranslation();
  const { data } = useApi<MemberProgramResponse>(`/members/${memberId}/program`);
  const current = data?.current;
  return (
    <Card className="flex-[1_1_150px] !gap-1.5">
      <h3 className="text-sm font-medium text-muted">{t('programs.memberTitle')}</h3>
      {current ? (
        <>
          <span className="font-semibold">{current.program.name}</span>
          <span className="text-xs text-muted">
            {t('programs.days', { count: current.program.dayCount })} ·{' '}
            {t('programs.since', {
              date: formatDate(current.assignedAt.slice(0, 10), i18n.language),
            })}
          </span>
        </>
      ) : (
        <span className="text-sm text-muted">{t('programs.noCurrent')}</span>
      )}
      <Link
        to={`/admin/members/${memberId}#program`}
        className="text-[13px] font-semibold text-lime"
      >
        {t(current ? 'programs.change' : 'programs.assign')}
      </Link>
    </Card>
  );
}

function AttendanceCard({ memberId }: { memberId: string }) {
  const { t, i18n } = useTranslation();
  const { data } = useApi<MemberAttendance>(`/members/${memberId}/attendance`);
  return (
    <Card className="flex-[1_1_150px] !gap-1.5">
      <h3 className="text-sm font-medium text-muted">{t('attendance.title')}</h3>
      <span className="font-display text-[34px] font-bold leading-none">
        {data ? data.days.length : '–'}
      </span>
      <span className="text-xs text-muted">
        {t('attendance.thisMonth')}
        {data?.lastVisit &&
          ` · ${t('attendance.last', { date: formatDate(data.lastVisit, i18n.language) })}`}
      </span>
    </Card>
  );
}

function ProgressCard({ memberId }: { memberId: string }) {
  const { t } = useTranslation();
  const { data } = useApi<MemberProgress>(`/members/${memberId}/progress`);
  const unit = (u: string, v: number) => t(`programs.unitValue.${u}`, { count: v });

  return (
    <Card
      title={t('progress.open')}
      action={
        <ButtonLink
          variant="outline"
          to={`/admin/members/${memberId}/progress`}
          className="!px-3.5 text-[13px]"
        >
          {t('progress.addResult')}
        </ButtonLink>
      }
    >
      {!data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : data.exercises.length === 0 ? (
        <p className="text-sm text-muted">{t('progress.noResults')}</p>
      ) : (
        data.exercises.slice(0, 6).map((e) => {
          const change = e.latest - e.first;
          return (
            <CardRow key={e.exerciseId} className="!flex-nowrap">
              <span className="min-w-0 flex-1 truncate font-semibold">{e.name}</span>
              <span className="text-soft" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {t('progress.range', { from: unit(e.unit, e.first), to: unit(e.unit, e.latest) })}
              </span>
              <span
                className={`w-16 text-end ${change >= 0 ? 'text-lime' : 'text-soft'}`}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {change > 0 ? '+' : change < 0 ? '−' : '±'}
                {Math.abs(change)}
              </span>
            </CardRow>
          );
        })
      )}
    </Card>
  );
}
