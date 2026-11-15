import {
  addDays,
  isIsoDate,
  subscriptionEndDate,
  type MemberDetail,
  type Plan,
  type Subscription,
} from '@calisthenics/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError, apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { SelectField } from '../../components/ui/SelectField';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TextField } from '../../components/ui/TextField';
import { MemberAttendanceCard } from '../../features/attendance/MemberAttendanceCard';
import { errorMessage } from '../../features/auth/errorMessage';
import { Owes, SubscriptionPayments } from '../../features/payments/SubscriptionPayments';
import { MemberProgramCard } from '../../features/programs/MemberProgramCard';
import { useSettings } from '../../features/settings/SettingsContext';
import { formatDate, formatMoney } from '../../lib/format';

export function MemberPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data: member, error, reload } = useApi<MemberDetail>(`/members/${id}`);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-danger">{errorMessage(error, t)}</p>
        <ButtonLink variant="outline" to="/admin/members">
          {t('members.backToList')}
        </ButtonLink>
      </div>
    );
  }
  if (!member) return <p className="text-muted">{t('common.loading')}</p>;
  return <MemberProfile member={member} reload={reload} />;
}

function MemberProfile({ member, reload }: { member: MemberDetail; reload: () => void }) {
  const { t, i18n } = useTranslation();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const date = (iso: string) => formatDate(iso, i18n.language);

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    setBusy(true);
    try {
      await action();
      reload();
    } catch (error) {
      setActionError(errorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = () => {
    const archiving = !member.archivedAt;
    if (archiving && !window.confirm(t('members.confirmArchive'))) return;
    void run(() =>
      apiFetch(`/members/${member.id}/${archiving ? 'archive' : 'restore'}`, { method: 'POST' }),
    );
  };

  const cancelSubscription = (sub: Subscription) => {
    if (!window.confirm(t('subscriptions.confirmCancel', { plan: sub.planName }))) return;
    void run(() => apiFetch(`/subscriptions/${sub.id}/cancel`, { method: 'POST' }));
  };

  return (
    <div className="flex flex-col gap-8">
      <Link to="/admin/members" className="self-start text-sm text-muted hover:text-fg">
        {t('members.backToList')}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl font-bold uppercase">
            {member.firstName} {member.lastName}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={member.status} />
            {member.archivedAt && (
              <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
                {t('members.archived')}
              </span>
            )}
            {member.paidThrough && (
              <span className="text-sm text-soft">
                {t('members.paidThrough', { date: date(member.paidThrough) })}
              </span>
            )}
            {member.balanceCents > 0 && <Owes cents={member.balanceCents} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to={`/admin/members/${member.id}/progress`}>{t('progress.open')}</ButtonLink>
          <ButtonLink variant="outline" to={`/admin/members/${member.id}/edit`}>
            {t('common.edit')}
          </ButtonLink>
          <Button variant="outline" disabled={busy} onClick={toggleArchive}>
            {t(member.archivedAt ? 'members.restore' : 'members.archive')}
          </Button>
        </div>
      </header>

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
            <h2 className="font-display text-2xl font-bold uppercase">{t('members.details')}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Detail label={t('auth.phone')}>
                <span dir="ltr">{member.phone}</span>
              </Detail>
              <Detail label={t('auth.email')}>{member.email}</Detail>
              <Detail label={t('members.dateOfBirth')}>
                {member.dateOfBirth && date(member.dateOfBirth)}
              </Detail>
              <Detail label={t('members.emergencyContact')}>{member.emergencyContact}</Detail>
              <Detail label={t('members.account')}>
                {t(member.hasAccount ? 'members.hasAccount' : 'members.noAccount')}
              </Detail>
              <Detail label={t('members.memberSince')}>
                {date(member.createdAt.slice(0, 10))}
              </Detail>
            </dl>
            {(member.healthNotes || member.coachNotes) && (
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                {member.healthNotes && (
                  <Note label={t('members.healthNotes')}>{member.healthNotes}</Note>
                )}
                {member.coachNotes && (
                  <Note label={t('members.coachNotes')}>{member.coachNotes}</Note>
                )}
              </div>
            )}
          </section>
          <MemberAttendanceCard memberId={member.id} />
        </div>

        <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-display text-2xl font-bold uppercase">{t('subscriptions.title')}</h2>
          {member.archivedAt ? (
            <p className="text-sm text-muted">{t('subscriptions.archivedNote')}</p>
          ) : (
            // A new key after each sale or cancel resets the form to the next suggested start.
            <NewSubscription key={member.paidThrough ?? 'none'} member={member} onSold={reload} />
          )}
          {member.subscriptions.length === 0 ? (
            <p className="text-sm text-muted">{t('subscriptions.empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {member.subscriptions.map((sub) => (
                <SubscriptionRow
                  key={sub.id}
                  sub={sub}
                  busy={busy}
                  onCancel={() => cancelSubscription(sub)}
                  onChange={reload}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <MemberProgramCard memberId={member.id} archived={member.archivedAt !== null} />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children || '—'}</dd>
    </>
  );
}

function Note({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <p className="whitespace-pre-wrap text-sm">{children}</p>
    </div>
  );
}

function SubscriptionRow({
  sub,
  busy,
  onCancel,
  onChange,
}: {
  sub: Subscription;
  busy: boolean;
  onCancel: () => void;
  onChange: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();
  const canCancel = sub.status !== 'CANCELLED' && sub.status !== 'EXPIRED';

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">
            {sub.planName} · {formatMoney(sub.priceCents, currency, i18n.language)}
          </span>
          <span className="text-sm text-soft">
            {t('subscriptions.period', {
              start: formatDate(sub.startDate, i18n.language),
              end: formatDate(sub.endDate, i18n.language),
            })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={sub.status} />
          {canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="min-h-11 px-2 text-sm text-muted hover:text-danger disabled:opacity-60"
            >
              {t('subscriptions.cancel')}
            </button>
          )}
        </div>
      </div>
      <SubscriptionPayments sub={sub} onChange={onChange} />
    </li>
  );
}

/** Sells the next period. The start date defaults to the day after the last paid day. */
function NewSubscription({ member, onSold }: { member: MemberDetail; onSold: () => void }) {
  const { t, i18n } = useTranslation();
  const { today, currency } = useSettings();
  const { data } = useApi<{ plans: Plan[] }>('/plans');
  const plans = data?.plans.filter((p) => p.isActive) ?? [];

  const suggestedStart =
    member.paidThrough && member.paidThrough >= today ? addDays(member.paidThrough, 1) : today;

  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState(suggestedStart);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!data) return <p className="text-sm text-muted">{t('common.loading')}</p>;
  if (plans.length === 0) {
    return (
      <p className="rounded-md border border-line p-3 text-sm text-soft">
        {t('subscriptions.noPlans')}{' '}
        <Link to="/admin/plans" className="text-lime underline">
          {t('subscriptions.createPlan')}
        </Link>
      </p>
    );
  }

  const plan = plans.find((p) => p.id === planId) ?? plans[0]!;
  const validStart = isIsoDate(startDate);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validStart) return;
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/members/' + member.id + '/subscriptions', {
        method: 'POST',
        body: { planId: plan.id, startDate },
      });
      onSold();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SUBSCRIPTION_OVERLAP') {
        const period = err.details as { startDate: string; endDate: string };
        setError(
          t('errors.SUBSCRIPTION_OVERLAP', {
            start: formatDate(period.startDate, i18n.language),
            end: formatDate(period.endDate, i18n.language),
          }),
        );
      } else {
        setError(errorMessage(err, t));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-4"
    >
      <h3 className="font-semibold">{t('subscriptions.new')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={t('subscriptions.plan')}
          value={plan.id}
          onChange={(e) => setPlanId(e.target.value)}
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatMoney(p.priceCents, currency, i18n.language)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('subscriptions.startDate')}
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          error={validStart ? undefined : t('validation.date')}
        />
      </div>
      {validStart && (
        <p className="text-sm text-soft">
          {t('subscriptions.preview', {
            end: formatDate(subscriptionEndDate(startDate, plan.durationMonths), i18n.language),
            price: formatMoney(plan.priceCents, currency, i18n.language),
          })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={saving || !validStart} className="self-start">
        {t('subscriptions.sell')}
      </Button>
    </form>
  );
}
