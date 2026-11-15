import { addMonths, type MemberAttendance } from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../api/useApi';
import { errorMessage } from '../auth/errorMessage';
import { useSettings } from '../settings/SettingsContext';
import { formatDate } from '../../lib/format';

/** A member's visits: one month at a time, plus last visit and the all-time total. */
export function MemberAttendanceCard({ memberId }: { memberId: string }) {
  const { t, i18n } = useTranslation();
  const { today } = useSettings();
  const currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const { data, error } = useApi<MemberAttendance>(
    `/members/${memberId}/attendance?month=${month}`,
  );

  const shift = (months: number) => setMonth(addMonths(`${month}-01`, months).slice(0, 7));
  const monthName = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  const navButton =
    'min-h-11 min-w-11 rounded-md border border-line text-soft hover:border-soft disabled:opacity-40';

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-2xl font-bold uppercase">{t('attendance.title')}</h2>
      {error ? (
        <p className="text-sm text-danger">{errorMessage(error, t)}</p>
      ) : !data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <>
          <p className="text-sm text-soft">
            {data.lastVisit
              ? t('attendance.lastVisit', {
                  date: formatDate(data.lastVisit, i18n.language),
                  count: data.totalVisits,
                })
              : t('attendance.neverCame')}
          </p>
          <div className="flex items-center justify-between gap-2">
            {/* The arrows follow reading direction: "previous" points to the start side. */}
            <button
              type="button"
              className={navButton}
              onClick={() => shift(-1)}
              aria-label={t('common.previous')}
            >
              <span className="inline-block rtl:rotate-180">‹</span>
            </button>
            <span className="text-sm font-semibold">
              {monthName} · {t('attendance.visits', { count: data.days.length })}
            </span>
            <button
              type="button"
              className={navButton}
              onClick={() => shift(1)}
              disabled={month >= currentMonth}
              aria-label={t('common.next')}
            >
              <span className="inline-block rtl:rotate-180">›</span>
            </button>
          </div>
          {data.days.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {data.days.map((day) => (
                <li
                  key={day}
                  className="rounded-full border border-lime-dim px-2.5 py-0.5 text-xs text-soft"
                >
                  {new Intl.DateTimeFormat(i18n.language, {
                    weekday: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(`${day}T00:00:00Z`))}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
