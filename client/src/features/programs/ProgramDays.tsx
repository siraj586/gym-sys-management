import type { ProgramDay } from '@calisthenics/shared';
import { useTranslation } from 'react-i18next';
import { prescription, restText } from './prescription';

/** The days of a program, read-only: used on the program page and the member profile. */
export function ProgramDays({ days }: { days: ProgramDay[] }) {
  const { t } = useTranslation();

  return (
    <ol className="grid gap-4 md:grid-cols-2">
      {days.map((day, i) => (
        <li key={i} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <h3 className="font-display text-xl font-bold uppercase">{day.title}</h3>
          <ol className="flex flex-col divide-y divide-line">
            {day.exercises.map((e, j) => (
              <li key={j} className="flex flex-col gap-0.5 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{e.name}</span>
                  <span className="text-sm text-lime">{prescription(t, e)}</span>
                </div>
                {(e.restSeconds !== null || e.note) && (
                  <span className="text-sm text-muted">
                    {[restText(t, e.restSeconds), e.note].filter(Boolean).join(' · ')}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}
