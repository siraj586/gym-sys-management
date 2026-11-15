import type { ProgramDetail } from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { errorMessage } from '../../features/auth/errorMessage';
import { ProgramDays } from '../../features/programs/ProgramDays';
import { formatDate } from '../../lib/format';

export function ProgramPage() {
  const { t, i18n } = useTranslation();
  const { id = '' } = useParams();
  const { data: program, error, reload } = useApi<ProgramDetail>(`/programs/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-danger">{errorMessage(error, t)}</p>
        <ButtonLink variant="outline" to="/admin/programs">
          {t('programs.backToList')}
        </ButtonLink>
      </div>
    );
  }
  if (!program) return <p className="text-muted">{t('common.loading')}</p>;

  const toggleArchive = async () => {
    const archiving = !program.archivedAt;
    if (archiving && !window.confirm(t('programs.confirmArchive'))) return;
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/programs/${program.id}/${archiving ? 'archive' : 'restore'}`, {
        method: 'POST',
      });
      reload();
    } catch (err) {
      setActionError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Link to="/admin/programs" className="self-start text-sm text-muted hover:text-fg">
        {t('programs.backToList')}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-4xl font-bold uppercase">{program.name}</h1>
          <p className="text-soft">{[program.level, program.goal].filter(Boolean).join(' · ')}</p>
          {program.archivedAt && (
            <span className="self-start rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
              {t('programs.archived')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink variant="outline" to={`/admin/programs/${program.id}/edit`}>
            {t('common.edit')}
          </ButtonLink>
          <Button variant="outline" disabled={busy} onClick={() => void toggleArchive()}>
            {t(program.archivedAt ? 'programs.restore' : 'programs.archive')}
          </Button>
        </div>
      </header>

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      <ProgramDays days={program.days} />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold uppercase">
          {t('programs.membersOn', { count: program.members.length })}
        </h2>
        {program.members.length === 0 ? (
          <p className="text-sm text-muted">{t('programs.noMembers')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {program.members.map((m) => (
              <li key={m.id}>
                <Link
                  to={`/admin/members/${m.id}`}
                  className="flex flex-col rounded-md border border-line bg-surface px-3 py-2 text-sm hover:border-lime"
                >
                  <span className="font-semibold">
                    {m.firstName} {m.lastName}
                  </span>
                  <span className="text-muted">
                    {t('programs.since', {
                      date: formatDate(m.assignedAt.slice(0, 10), i18n.language),
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
