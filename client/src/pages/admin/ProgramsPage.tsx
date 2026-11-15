import type { ProgramSummary } from '@calisthenics/shared';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../../api/useApi';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { errorMessage } from '../../features/auth/errorMessage';

export function ProgramsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const archived = params.get('archived') === 'true';
  const { data, error } = useApi<{ programs: ProgramSummary[] }>(
    `/programs${archived ? '?archived=true' : ''}`,
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">{t('programs.title')}</h1>
          <p className="text-sm text-muted">{t('programs.intro')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink variant="outline" to="/admin/exercises">
            {t('exercises.title')}
          </ButtonLink>
          <ButtonLink to="/admin/programs/new">{t('programs.add')}</ButtonLink>
        </div>
      </div>

      <label className="flex items-center gap-2 self-start text-sm text-soft">
        <input
          type="checkbox"
          checked={archived}
          onChange={(e) =>
            setParams(e.target.checked ? { archived: 'true' } : {}, { replace: true })
          }
          className="size-4 accent-lime"
        />
        {t('programs.showArchived')}
      </label>

      {error ? (
        <p className="text-danger">{errorMessage(error, t)}</p>
      ) : !data ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : data.programs.length === 0 ? (
        <p className="rounded-lg border border-line p-6 text-center text-muted">
          {t(archived ? 'programs.noneArchived' : 'programs.empty')}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.programs.map((p) => (
            <li key={p.id}>
              <Link
                to={`/admin/programs/${p.id}`}
                className="flex h-full flex-col gap-2 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-lime"
              >
                <span className="font-display text-2xl font-bold uppercase leading-tight">
                  {p.name}
                </span>
                {p.level && <span className="text-sm text-lime">{p.level}</span>}
                {p.goal && <span className="text-sm text-soft">{p.goal}</span>}
                <span className="mt-auto text-sm text-muted">
                  {t('programs.days', { count: p.dayCount })} ·{' '}
                  {t('programs.membersOn', { count: p.activeMembers })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
