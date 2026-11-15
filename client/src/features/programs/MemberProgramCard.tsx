import type { MemberProgramResponse, ProgramSummary } from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { SelectField } from '../../components/ui/SelectField';
import { formatDate } from '../../lib/format';
import { errorMessage } from '../auth/errorMessage';
import { ProgramDays } from './ProgramDays';

/** The member's current training program, switching it, and past programs. */
export function MemberProgramCard({ memberId, archived }: { memberId: string; archived: boolean }) {
  const { t, i18n } = useTranslation();
  const assignment = useApi<MemberProgramResponse>(`/members/${memberId}/program`);
  const programs = useApi<{ programs: ProgramSummary[] }>('/programs');
  const [choice, setChoice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const day = (iso: string) => formatDate(iso.slice(0, 10), i18n.language);

  const current = assignment.data?.current ?? null;
  const choices = (programs.data?.programs ?? []).filter((p) => p.id !== current?.program.id);

  const change = async (method: 'PUT' | 'DELETE') => {
    if (method === 'DELETE' && !window.confirm(t('programs.confirmEnd'))) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/members/${memberId}/program`, {
        method,
        body: method === 'PUT' ? { programId: choice } : undefined,
      });
      setChoice('');
      assignment.reload();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="program" className="flex scroll-mt-6 flex-col gap-4 rounded-lg border border-line bg-surface p-5">
      <h2 className="font-display text-2xl font-bold uppercase">{t('programs.memberTitle')}</h2>

      {assignment.error ? (
        <p className="text-sm text-danger">{errorMessage(assignment.error, t)}</p>
      ) : !assignment.data ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : (
        <>
          {current ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col">
                <Link
                  to={`/admin/programs/${current.program.id}`}
                  className="font-display text-2xl font-bold uppercase hover:text-lime"
                >
                  {current.program.name}
                </Link>
                <span className="text-sm text-muted">
                  {t('programs.since', { date: day(current.assignedAt) })}
                </span>
              </div>
              <Button variant="outline" disabled={busy} onClick={() => void change('DELETE')}>
                {t('programs.end')}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('programs.noCurrent')}</p>
          )}

          {!archived && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <SelectField
                  label={t(current ? 'programs.switchTo' : 'programs.assign')}
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                >
                  <option value="">{t('programs.chooseProgram')}</option>
                  {choices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.level && ` · ${p.level}`}
                    </option>
                  ))}
                </SelectField>
              </div>
              <Button disabled={busy || !choice} onClick={() => void change('PUT')}>
                {t(current ? 'programs.switch' : 'programs.assignButton')}
              </Button>
            </div>
          )}
          {programs.data && programs.data.programs.length === 0 && (
            <p className="text-sm text-soft">
              <Link to="/admin/programs/new" className="text-lime underline">
                {t('programs.createFirst')}
              </Link>
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          {current && (
            <details className="group">
              <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-soft hover:text-fg">
                {t('programs.showDays', { count: current.program.days.length })}
              </summary>
              <div className="pt-3">
                <ProgramDays days={current.program.days} />
              </div>
            </details>
          )}

          {assignment.data.history.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <h3 className="text-sm font-semibold text-soft">{t('programs.history')}</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {assignment.data.history.map((h) => (
                  <li key={`${h.programId}-${h.assignedAt}`} className="flex flex-wrap gap-x-2">
                    <Link to={`/admin/programs/${h.programId}`} className="hover:text-lime">
                      {h.name}
                    </Link>
                    <span className="text-muted">
                      {t('subscriptions.period', { start: day(h.assignedAt), end: day(h.endedAt) })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
