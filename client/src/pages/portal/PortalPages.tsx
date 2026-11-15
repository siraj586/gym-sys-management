import {
  addMonths,
  portalProfileInputSchema,
  type ExerciseProgress,
  type PortalAttendance,
  type PortalHome,
  type PortalProfile,
  type PortalProgram,
  type PortalSubscription,
} from '@calisthenics/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { LineChart } from '../../components/charts/LineChart';
import { Button } from '../../components/ui/Button';
import { Card, CardRow } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../features/auth/AuthContext';
import { errorMessage } from '../../features/auth/errorMessage';
import { prescription, restText } from '../../features/programs/prescription';
import { PayOnline } from '../../features/checkout/PayOnline';
import { SubscribeCard } from '../../features/checkout/SubscribeCard';
import { useSettings } from '../../features/settings/SettingsContext';
import { formatDate, formatMoney, formatTime } from '../../lib/format';

/** Loads the home data once per page; every portal page reads from it. */
function useHome() {
  return useApi<PortalHome>('/portal/home');
}

function Loading({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return error ? (
    <p className="text-danger">{errorMessage(error, t)}</p>
  ) : (
    <p className="text-muted">{t('common.loading')}</p>
  );
}

const longDate = (iso: string, language: string) =>
  new Intl.DateTimeFormat(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

// ---------- Home ----------

export function PortalHomePage() {
  const { t } = useTranslation();
  const home = useHome();
  if (!home.data) return <Loading error={home.error} />;
  const h = home.data;

  return (
    <>
      <h1 className="font-display text-[40px] font-bold uppercase leading-none">
        {t('portal.hi', { name: h.firstName })}
      </h1>
      {/* No current or booked month (new sign-up, or it ran out): subscribe first. */}
      {(h.status === 'NONE' || h.status === 'EXPIRED') && <SubscribeCard />}
      <div className="flex flex-wrap gap-[18px]">
        <SubscriptionCard sub={h.subscription} />
        <Card
          id="program"
          className="flex-[2_1_420px]"
          title={t('portal.myProgram')}
          subtitle={h.program && t('portal.setByCoach', { name: h.program.name })}
        >
          {h.program ? (
            <ProgramTabs program={h.program} />
          ) : (
            <p className="text-sm text-muted">{t('portal.noProgram')}</p>
          )}
        </Card>
      </div>
      <div className="flex flex-wrap gap-[18px]">
        <VisitsCard count={h.visitsThisMonth} visits={h.recentVisits} />
        <Card
          id="progress"
          className="flex-[2_1_420px]"
          title={t('portal.myProgress')}
          subtitle={t('portal.recordedByCoach')}
        >
          <ProgressBlock exercises={h.progress} />
        </Card>
      </div>
    </>
  );
}

function SubscriptionCard({ sub }: { sub: PortalSubscription | null }) {
  const { t, i18n } = useTranslation();
  const { currency } = useSettings();

  if (!sub) {
    return (
      <Card className="flex-[1_1_320px]" title={t('portal.mySubscription')}>
        <p className="text-sm text-soft">{t('portal.noSubscription')}</p>
      </Card>
    );
  }

  const covering = sub.status === 'ACTIVE' || sub.status === 'EXPIRING';
  const used = Math.min(sub.totalDays, Math.max(0, sub.totalDays - sub.daysLeft));
  return (
    <Card
      className="flex-[1_1_320px]"
      accent={covering}
      title={t('portal.mySubscription')}
      action={<StatusBadge status={sub.status} />}
    >
      <p className="text-lg font-semibold">{sub.planName}</p>
      <div className="flex items-baseline gap-2.5">
        <span
          className={`font-display text-7xl font-bold leading-none ${covering ? 'text-lime' : 'text-danger'}`}
        >
          {sub.status === 'UPCOMING' ? sub.daysLeft - sub.totalDays : Math.abs(sub.daysLeft)}
        </span>
        <span className="text-soft">
          {sub.status === 'UPCOMING'
            ? t('portal.daysUntilStart')
            : sub.daysLeft < 0
              ? t('portal.daysSinceEnd', { count: -sub.daysLeft })
              : t('portal.daysLeft', { count: sub.daysLeft })}
        </span>
      </div>
      <div
        role="img"
        aria-label={t('members.daysUsed', { used, total: sub.totalDays })}
        className="h-2.5 overflow-hidden rounded-sm bg-line"
      >
        <div
          className="h-full bg-lime"
          style={{ width: `${(used / Math.max(1, sub.totalDays)) * 100}%` }}
        />
      </div>
      <p className="text-[13px] text-soft">
        {t('subscriptions.period', {
          start: longDate(sub.startDate, i18n.language),
          end: longDate(sub.endDate, i18n.language),
        })}
      </p>
      <p className="text-[13px] text-muted">
        {sub.lastPayment
          ? t('portal.paidOn', {
              amount: formatMoney(sub.lastPayment.amountCents, currency, i18n.language),
              date: formatDate(sub.lastPayment.paidAt, i18n.language),
            })
          : t('members.notPaidYet')}{' '}
        {t('portal.renewAtGym')}
      </p>
      {/* Renewing early online; a lapsed month has the subscribe card above instead. */}
      {covering && <PayOnline />}
    </Card>
  );
}

function ProgramTabs({ program, showAll = false }: { program: PortalProgram; showAll?: boolean }) {
  const { t } = useTranslation();
  const [day, setDay] = useState(0);
  const shown = program.days[Math.min(day, program.days.length - 1)];

  return (
    <>
      <div
        role="tablist"
        aria-label={t('programs.daysLabel')}
        className="flex flex-wrap gap-1 border-b border-line"
      >
        {program.days.map((d, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={d === shown}
            onClick={() => setDay(i)}
            className={`min-h-11 px-3.5 text-sm ${d === shown ? 'border-b-2 border-lime font-semibold text-lime' : 'text-soft hover:text-fg'}`}
          >
            {t('programs.dayTab', { number: i + 1, title: d.title })}
          </button>
        ))}
      </div>
      {shown && (
        <div role="tabpanel" className="flex flex-col">
          {shown.exercises.map((e, i) => (
            <div
              key={i}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-line py-2.5"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              <span className="min-w-0 flex-[1_1_160px] font-semibold">{e.name}</span>
              <span className="font-semibold text-lime">{prescription(t, e)}</span>
              <span className="w-24 text-end text-xs text-muted">{restText(t, e.restSeconds)}</span>
              {showAll && e.note && <span className="basis-full text-sm text-muted">{e.note}</span>}
            </div>
          ))}
        </div>
      )}
      {!showAll && (
        <Link to="/portal/program" className="self-start text-[13px] font-semibold text-lime">
          {t('portal.fullProgram')}
        </Link>
      )}
    </>
  );
}

function VisitsCard({ count, visits }: { count: number; visits: PortalHome['recentVisits'] }) {
  const { t, i18n } = useTranslation();
  const { timezone, today } = useSettings();
  const dayName = (iso: string) =>
    iso === today
      ? t('portal.todayIs', {
          date: new Intl.DateTimeFormat(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'UTC',
          }).format(new Date(`${iso}T00:00:00Z`)),
        })
      : new Intl.DateTimeFormat(i18n.language, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }).format(new Date(`${iso}T00:00:00Z`));

  return (
    <Card id="attendance" className="flex-[1_1_320px]" title={t('portal.myAttendance')}>
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-[44px] font-bold leading-none">{count}</span>
        <span className="text-soft">{t('portal.visitsThisMonth', { count })}</span>
      </div>
      {visits.map((v) => (
        <CardRow key={v.date} className="!flex-nowrap">
          <span className="min-w-0 flex-1">{dayName(v.date)}</span>
          <span className="text-muted" dir="ltr" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(v.checkedInAt, i18n.language, timezone)}
          </span>
        </CardRow>
      ))}
      <p className="text-xs text-muted">{t('portal.recordedOnArrival')}</p>
      <Link to="/portal/attendance" className="self-start text-[13px] font-semibold text-lime">
        {t('portal.allVisits')}
      </Link>
    </Card>
  );
}

/** Skill cards; the chosen one is charted below them. */
function ProgressBlock({ exercises }: { exercises: ExerciseProgress[] }) {
  const { t, i18n } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(null);
  if (exercises.length === 0) {
    return <p className="text-sm text-muted">{t('portal.noProgress')}</p>;
  }
  const selected = exercises.find((e) => e.exerciseId === chosen) ?? exercises[0]!;
  const fmt = (unit: ExerciseProgress['unit'], v: number) =>
    t(`programs.unitValue.${unit}`, { count: v });

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
        {exercises.map((e) => {
          const change = e.latest - e.first;
          const active = e === selected;
          return (
            <button
              key={e.exerciseId}
              type="button"
              aria-pressed={active}
              onClick={() => setChosen(e.exerciseId)}
              className={`flex flex-col items-start rounded-lg border bg-ink p-3.5 text-start ${active ? 'border-lime' : 'border-line hover:border-soft'}`}
            >
              <span className="text-xs text-muted">{e.name}</span>
              <span className="font-display text-[32px] font-bold leading-tight">
                {fmt(e.unit, e.latest)}
              </span>
              <span className="text-xs text-lime">
                {e.records.length > 1
                  ? t('portal.sinceFirst', {
                      change: `${change > 0 ? '+' : ''}${fmt(e.unit, change)}`,
                    })
                  : t('portal.firstRecord')}
              </span>
            </button>
          );
        })}
      </div>
      {selected.records.length > 1 ? (
        <LineChart
          points={selected.records.map((r) => ({ date: r.recordedAt, value: r.value }))}
          label={t('progress.chartLabel', { name: selected.name })}
          formatValue={(v) => fmt(selected.unit, v)}
          formatDate={(d) => formatDate(d, i18n.language)}
        />
      ) : (
        <p className="text-sm text-muted">{t('progress.oneResult')}</p>
      )}
    </>
  );
}

// ---------- Other portal pages ----------

export function PortalProgramPage() {
  const { t, i18n } = useTranslation();
  const home = useHome();
  if (!home.data) return <Loading error={home.error} />;
  const program = home.data.program;

  return (
    <>
      <h1 className="font-display text-[40px] font-bold uppercase leading-none">
        {t('portal.myProgram')}
      </h1>
      {program ? (
        <Card
          title={program.name}
          subtitle={[
            program.level,
            t('programs.daysAWeek', { count: program.days.length }),
            program.goal,
            t('programs.since', {
              date: formatDate(program.assignedAt.slice(0, 10), i18n.language),
            }),
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          <ProgramTabs program={program} showAll />
        </Card>
      ) : (
        <p className="text-muted">{t('portal.noProgram')}</p>
      )}
    </>
  );
}

export function PortalAttendancePage() {
  const { t, i18n } = useTranslation();
  const { today, timezone } = useSettings();
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data, error } = useApi<PortalAttendance>(`/portal/attendance?month=${month}`);
  const monthName = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  const shift = (n: number) => setMonth(addMonths(`${month}-01`, n).slice(0, 7));
  const nav =
    'min-h-11 min-w-11 rounded-md border border-line text-soft hover:border-soft disabled:opacity-40';

  return (
    <>
      <h1 className="font-display text-[40px] font-bold uppercase leading-none">
        {t('portal.myAttendance')}
      </h1>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={nav}
            onClick={() => shift(-1)}
            aria-label={t('common.previous')}
          >
            <span className="inline-block rtl:rotate-180">‹</span>
          </button>
          <span className="font-semibold">
            {monthName}
            {data && ` · ${t('attendance.visits', { count: data.visits.length })}`}
          </span>
          <button
            type="button"
            className={nav}
            onClick={() => shift(1)}
            disabled={month >= today.slice(0, 7)}
            aria-label={t('common.next')}
          >
            <span className="inline-block rtl:rotate-180">›</span>
          </button>
        </div>
        {!data ? (
          <Loading error={error} />
        ) : data.visits.length === 0 ? (
          <p className="text-sm text-muted">{t('portal.noVisitsMonth')}</p>
        ) : (
          data.visits.map((v) => (
            <CardRow key={v.date} className="!flex-nowrap">
              <span className="min-w-0 flex-1">{longDate(v.date, i18n.language)}</span>
              <span className="text-muted" dir="ltr" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatTime(v.checkedInAt, i18n.language, timezone)}
              </span>
            </CardRow>
          ))
        )}
        {data && (
          <p className="text-xs text-muted">
            {t('portal.totalVisits', { count: data.totalVisits })}
          </p>
        )}
      </Card>
    </>
  );
}

export function PortalProgressPage() {
  const { t, i18n } = useTranslation();
  const { data, error } = useApi<{ exercises: ExerciseProgress[] }>('/portal/progress');
  if (!data) return <Loading error={error} />;

  return (
    <>
      <h1 className="font-display text-[40px] font-bold uppercase leading-none">
        {t('portal.myProgress')}
      </h1>
      <Card subtitle={t('portal.recordedByCoach')}>
        <ProgressBlock exercises={data.exercises} />
      </Card>
      {data.exercises.map((e) => (
        <Card key={e.exerciseId} title={e.name}>
          {[...e.records].reverse().map((r) => (
            <CardRow key={r.id} className="!flex-nowrap text-sm">
              <span className="w-32 text-muted">{formatDate(r.recordedAt, i18n.language)}</span>
              <span className="font-semibold">
                {t(`programs.unitValue.${e.unit}`, { count: r.value })}
              </span>
              {r.note && <span className="min-w-0 flex-1 truncate text-muted">{r.note}</span>}
            </CardRow>
          ))}
        </Card>
      ))}
    </>
  );
}

export function PortalProfilePage() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { data, error } = useApi<PortalProfile>('/portal/profile');
  if (!data) return <Loading error={error} />;

  return (
    <>
      <h1 className="font-display text-[40px] font-bold uppercase leading-none">
        {t('portal.nav.profile')}
      </h1>
      <ProfileForm profile={data} />
      <Card title={t('portal.account')}>
        <p className="text-sm text-soft">{t('portal.signedInAs', { email: data.email })}</p>
        <Button variant="outline" className="self-start" onClick={() => void logout()}>
          {t('nav.logout')}
        </Button>
      </Card>
    </>
  );
}

function ProfileForm({ profile }: { profile: PortalProfile }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({
    firstName: profile.firstName,
    lastName: profile.lastName,
    phone: profile.phone,
    dateOfBirth: profile.dateOfBirth ?? '',
    emergencyContact: profile.emergencyContact ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const field = (name: keyof typeof values) => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) =>
      setValues({ ...values, [name]: e.target.value }),
    error: errors[name],
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus(null);
    const parsed = portalProfileInputSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= t(issue.message);
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await apiFetch('/portal/profile', { method: 'PUT', body: parsed.data });
      setStatus({ ok: true, text: t('settings.saved') });
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err, t) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('portal.myDetails')}>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex max-w-2xl flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('auth.firstName')}
            autoComplete="given-name"
            {...field('firstName')}
          />
          <TextField label={t('auth.lastName')} autoComplete="family-name" {...field('lastName')} />
          <TextField
            label={t('auth.phone')}
            type="tel"
            dir="ltr"
            autoComplete="tel"
            {...field('phone')}
          />
          <TextField
            label={t('auth.email')}
            value={profile.email}
            disabled
            hint={t('portal.emailFixed')}
            dir="ltr"
            readOnly
          />
          <TextField label={t('members.dateOfBirth')} type="date" {...field('dateOfBirth')} />
          <TextField
            label={t('members.emergencyContact')}
            hint={t('members.emergencyContactHint')}
            {...field('emergencyContact')}
          />
        </div>
        {status && (
          <p role="status" className={`text-sm ${status.ok ? 'text-lime' : 'text-danger'}`}>
            {status.text}
          </p>
        )}
        <Button type="submit" disabled={saving} className="self-start">
          {t('common.save')}
        </Button>
      </form>
    </Card>
  );
}
