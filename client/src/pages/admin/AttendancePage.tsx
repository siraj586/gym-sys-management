import {
  isIsoDate,
  type CheckIn,
  type CheckInListResponse,
  type MemberListResponse,
  type MemberSummary,
} from '@calisthenics/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { ApiError, apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { errorMessage } from '../../features/auth/errorMessage';
import { Owes } from '../../features/payments/SubscriptionPayments';
import { useSettings } from '../../features/settings/SettingsContext';
import { formatDate, formatTime } from '../../lib/format';

/** A subscription covers today: no reason to stop at the desk. */
const COVERED = new Set(['ACTIVE', 'EXPIRING']);

/**
 * The check-in desk: find a member, check them in, see who came.
 * ?date= shows (and fills in) an earlier day.
 */
export function AttendancePage() {
  const { t, i18n } = useTranslation();
  const { today } = useSettings();
  const [params, setParams] = useSearchParams();
  const requested = params.get('date') ?? '';
  const date = isIsoDate(requested) && requested <= today ? requested : today;
  const isToday = date === today;

  const list = useApi<CheckInListResponse>(`/check-ins?date=${date}`);
  const checkedIn = new Set(
    list.data?.date === date ? list.data.checkIns.map((c) => c.member.id) : [],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-bold uppercase">{t('attendance.title')}</h1>
            <p className={isToday ? 'text-muted' : 'font-semibold text-warn'}>
              {isToday
                ? formatDate(date, i18n.language)
                : t('attendance.pastDay', { date: formatDate(date, i18n.language) })}
            </p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm text-soft">
            {t('attendance.day')}
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) =>
                setParams(
                  isIsoDate(e.target.value) && e.target.value !== today
                    ? { date: e.target.value }
                    : {},
                  { replace: true },
                )
              }
              className="min-h-11 rounded-md border border-line bg-surface px-3 text-fg outline-none focus:border-lime"
            />
          </label>
        </div>
        <CheckInDesk date={date} warn={isToday} checkedIn={checkedIn} onCheckedIn={list.reload} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-bold uppercase">
          {t('attendance.cameCount', { count: list.data?.checkIns.length ?? 0 })}
        </h2>
        {list.error ? (
          <p className="text-danger">{errorMessage(list.error, t)}</p>
        ) : !list.data ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : list.data.checkIns.length === 0 ? (
          <p className="rounded-lg border border-line p-6 text-center text-muted">
            {t('attendance.nobodyYet')}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {list.data.checkIns.map((c) => (
              <CheckInRow key={c.id} checkIn={c} onRemoved={list.reload} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CheckInDesk({
  date,
  warn,
  checkedIn,
  onCheckedIn,
}: {
  date: string;
  /** Today only: today's status says nothing about a day already past. */
  warn: boolean;
  checkedIn: Set<string>;
  onCheckedIn: () => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Search after a short pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  const results = useApi<MemberListResponse>(
    search ? `/members?search=${encodeURIComponent(search)}` : null,
  );

  const checkIn = async (m: MemberSummary) => {
    // Not covered today: still allowed (the coach decides), but never by accident.
    const question = t('attendance.confirmNotCovered', {
      name: m.firstName,
      status: t(`status.${m.status}`),
    });
    if (warn && !COVERED.has(m.status) && !window.confirm(question)) return;
    setError(null);
    setBusyId(m.id);
    try {
      await apiFetch('/check-ins', { method: 'POST', body: { memberId: m.id, date } });
      onCheckedIn();
      setInput('');
      setSearch('');
    } catch (err) {
      // Someone else (another tab) already did it: the list just needs to catch up.
      if (err instanceof ApiError && err.code === 'ALREADY_CHECKED_IN') onCheckedIn();
      setError(errorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t('attendance.searchPlaceholder')}
        aria-label={t('attendance.search')}
        autoFocus
        className="min-h-12 w-full rounded-md border border-line bg-surface px-4 text-lg text-fg outline-none focus:border-lime"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {search &&
        results.data &&
        (results.data.members.length === 0 ? (
          <p className="text-sm text-muted">{t('members.noMatches')}</p>
        ) : (
          <ul
            className={`divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface ${results.loading ? 'opacity-60' : ''}`}
          >
            {results.data.members.map((m) => {
              const done = checkedIn.has(m.id);
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex flex-col gap-1">
                    <Link to={`/admin/members/${m.id}`} className="font-semibold hover:text-lime">
                      {m.firstName} {m.lastName}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={m.status} />
                      {m.balanceCents > 0 && <Owes cents={m.balanceCents} />}
                    </div>
                  </div>
                  {done ? (
                    <span className="text-sm font-semibold text-lime">
                      {t('attendance.checkedIn')}
                    </span>
                  ) : (
                    <Button disabled={busyId !== null} onClick={() => void checkIn(m)}>
                      {t('attendance.checkIn')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}

function CheckInRow({ checkIn, onRemoved }: { checkIn: CheckIn; onRemoved: () => void }) {
  const { t, i18n } = useTranslation();
  const { timezone } = useSettings();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    const name = `${checkIn.member.firstName} ${checkIn.member.lastName}`;
    if (!window.confirm(t('attendance.confirmUndo', { name }))) return;
    setBusy(true);
    try {
      await apiFetch(`/check-ins/${checkIn.id}`, { method: 'DELETE' });
      onRemoved();
    } catch (err) {
      setError(errorMessage(err, t));
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-baseline gap-3">
          <span className="w-16 shrink-0 text-sm text-muted" dir="ltr">
            {formatTime(checkIn.checkedInAt, i18n.language, timezone)}
          </span>
          <Link
            to={`/admin/members/${checkIn.member.id}`}
            className="font-semibold hover:text-lime"
          >
            {checkIn.member.firstName} {checkIn.member.lastName}
          </Link>
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="min-h-11 px-2 text-sm text-muted hover:text-danger disabled:opacity-60"
        >
          {t('attendance.undo')}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
