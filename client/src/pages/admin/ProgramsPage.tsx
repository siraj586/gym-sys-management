import type { MemberSummary, ProgramDetail, ProgramSummary } from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { Card, CardRow } from '../../components/ui/Card';
import { errorMessage } from '../../features/auth/errorMessage';
import { MemberPicker } from '../../features/members/MemberPicker';
import { restText } from '../../features/programs/prescription';
import { formatDate } from '../../lib/format';

/** /admin/programs and /admin/programs/:id: the list beside the chosen program. */
export function ProgramsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const archived = params.get('archived') === 'true';
  const list = useApi<{ programs: ProgramSummary[] }>(
    `/programs${archived ? '?archived=true' : ''}`,
  );
  const selectedId = id ?? list.data?.programs[0]?.id ?? null;

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHeader
        title={t('programs.title')}
        action={
          <>
            <ButtonLink variant="outline" to="/admin/exercises">
              {t('exercises.title')}
            </ButtonLink>
            <ButtonLink to="/admin/programs/new">{t('programs.add')}</ButtonLink>
          </>
        }
      />

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[1_1_220px] flex-col gap-3">
          <div className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
            {list.error ? (
              <p className="p-4 text-danger">{errorMessage(list.error, t)}</p>
            ) : !list.data ? (
              <p className="p-4 text-muted">{t('common.loading')}</p>
            ) : list.data.programs.length === 0 ? (
              <p className="p-4 text-muted">
                {t(archived ? 'programs.noneArchived' : 'programs.empty')}
              </p>
            ) : (
              list.data.programs.map((p) => (
                <Link
                  key={p.id}
                  to={`/admin/programs/${p.id}${archived ? '?archived=true' : ''}`}
                  aria-current={p.id === selectedId ? 'page' : undefined}
                  className={`block min-h-11 border-b border-line px-4 py-3.5 ${p.id === selectedId ? 'bg-chip' : 'hover:bg-surface-2'}`}
                >
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block text-xs text-muted">
                    {t('programs.daysAWeek', { count: p.dayCount })} ·{' '}
                    {t('programs.membersOn', { count: p.activeMembers })}
                  </span>
                </Link>
              ))
            )}
            <p className="px-4 py-3 text-xs text-muted">{t('programs.templatesNote')}</p>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-[13px] text-soft">
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
        </section>

        <section className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
          {selectedId ? (
            <ProgramDetailView key={selectedId} id={selectedId} onChanged={list.reload} />
          ) : (
            list.data && (
              <p className="rounded-lg border border-dashed border-dash p-6 text-center text-muted">
                {t('programs.pickOne')}
              </p>
            )
          )}
        </section>
      </div>
    </div>
  );
}

function ProgramDetailView({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: program, error, reload } = useApi<ProgramDetail>(`/programs/${id}`);
  const [day, setDay] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignee, setAssignee] = useState<MemberSummary | null>(null);
  const [pickerRound, setPickerRound] = useState(0);

  if (error) return <p className="text-danger">{errorMessage(error, t)}</p>;
  if (!program) return <p className="text-muted">{t('common.loading')}</p>;

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    setBusy(true);
    try {
      await action();
      reload();
      onChanged();
    } catch (err) {
      setActionError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    setActionError(null);
    try {
      const copy = await apiFetch<ProgramDetail>(`/programs/${program.id}/duplicate`, {
        method: 'POST',
        body: { suffix: t('programs.copySuffix') },
      });
      onChanged();
      void navigate(`/admin/programs/${copy.id}`);
    } catch (err) {
      setActionError(errorMessage(err, t));
    }
  };

  const toggleArchive = () => {
    const archiving = !program.archivedAt;
    if (archiving && !window.confirm(t('programs.confirmArchive'))) return;
    void run(() =>
      apiFetch(`/programs/${program.id}/${archiving ? 'archive' : 'restore'}`, { method: 'POST' }),
    );
  };

  const assign = () => {
    if (!assignee) {
      setActionError(t('attendance.pickMember'));
      return;
    }
    void run(async () => {
      await apiFetch(`/members/${assignee.id}/program`, {
        method: 'PUT',
        body: { programId: program.id },
      });
      setAssignee(null);
      setPickerRound((r) => r + 1);
    });
  };

  const removeMember = (memberId: string, name: string) => {
    if (!window.confirm(t('programs.confirmRemoveMember', { name }))) return;
    void run(() => apiFetch(`/members/${memberId}/program`, { method: 'DELETE' }));
  };

  const shownDay = program.days[Math.min(day, program.days.length - 1)];
  const meta = [
    program.level && t('programs.levelIs', { level: program.level }),
    t('programs.daysAWeek', { count: program.dayCount }),
    program.goal && t('programs.goalIs', { goal: program.goal }),
  ].filter(Boolean);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-[1_1_240px]">
            <h2 className="text-[22px] font-semibold">{program.name}</h2>
            <p className="text-muted">{meta.join(' · ')}</p>
            {program.archivedAt && (
              <p className="text-xs text-warn">{t('programs.archivedNote')}</p>
            )}
          </div>
          <ButtonLink variant="outline" to={`/admin/programs/${program.id}/edit`}>
            {t('common.edit')}
          </ButtonLink>
          <Button
            variant="outline"
            className="!border-line !text-soft"
            onClick={() => void duplicate()}
          >
            {t('programs.duplicate')}
          </Button>
          <Button
            variant="outline"
            className="!border-line !text-soft"
            disabled={busy}
            onClick={toggleArchive}
          >
            {t(program.archivedAt ? 'programs.restore' : 'programs.archive')}
          </Button>
        </div>
        {actionError && (
          <p role="alert" className="text-sm text-danger">
            {actionError}
          </p>
        )}

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
              aria-selected={d === shownDay}
              onClick={() => setDay(i)}
              className={`min-h-11 px-3.5 text-sm ${d === shownDay ? 'border-b-2 border-lime font-semibold text-lime' : 'text-soft hover:text-fg'}`}
            >
              {t('programs.dayTab', { number: i + 1, title: d.title })}
            </button>
          ))}
          <Link
            to={`/admin/programs/${program.id}/edit`}
            className="flex min-h-11 items-center px-3.5 text-sm text-soft hover:text-fg"
          >
            {t('programs.addDay')}
          </Link>
        </div>

        {shownDay && (
          <div role="tabpanel" className="overflow-x-auto">
            <table
              className="w-full min-w-[520px] border-collapse"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-2 pe-2 text-start font-medium">{t('programs.exercise')}</th>
                  <th className="p-2 text-start font-medium">{t('programs.sets')}</th>
                  <th className="p-2 text-start font-medium">{t('programs.repsOrTime')}</th>
                  <th className="p-2 text-start font-medium">{t('programs.restCol')}</th>
                  <th className="py-2 ps-2 text-start font-medium">{t('programs.coachNote')}</th>
                </tr>
              </thead>
              <tbody>
                {shownDay.exercises.map((e, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-3 pe-2 font-semibold">{e.name}</td>
                    <td className="p-3">{e.sets}</td>
                    <td className="p-3">
                      {t(`programs.unitValue.${e.unit}`, { count: e.target })}
                    </td>
                    <td className="p-3 text-soft">{restText(t, e.restSeconds) ?? '—'}</td>
                    <td className="py-3 ps-2 text-muted">{e.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ButtonLink
          variant="outline"
          to={`/admin/programs/${program.id}/edit`}
          className="self-start"
        >
          {t('programs.addExercise')}
        </ButtonLink>
      </Card>

      <Card title={t('programs.assignedTo', { count: program.members.length })}>
        {!program.archivedAt && (
          <div className="flex flex-wrap items-start gap-2">
            <MemberPicker
              key={pickerRound}
              label={t('programs.assignToMember')}
              hideLabel
              placeholder={t('attendance.searchPlaceholder')}
              selected={assignee}
              onSelect={setAssignee}
            />
            <Button disabled={busy} onClick={assign}>
              {t('programs.assignToMember')}
            </Button>
          </div>
        )}
        {program.members.map((m) => (
          <CardRow key={m.id}>
            <Link to={`/admin/members?m=${m.id}`} className="min-w-0 flex-1 hover:text-lime">
              <span className="block font-semibold">
                {m.firstName} {m.lastName}
              </span>
              <span className="block text-xs text-muted">
                {t('programs.since', {
                  date: formatDate(m.assignedAt.slice(0, 10), i18n.language),
                })}
              </span>
            </Link>
            <Button
              variant="outline"
              className="!border-line !px-3 !text-soft"
              disabled={busy}
              onClick={() => removeMember(m.id, m.firstName)}
            >
              {t('programs.removeMember')}
            </Button>
          </CardRow>
        ))}
        <p className="text-xs text-muted">{t('programs.oneAtATime')}</p>
      </Card>
    </>
  );
}
