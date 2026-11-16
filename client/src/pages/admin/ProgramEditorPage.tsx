import {
  PROGRAM_LIMITS,
  programInputSchema,
  type Exercise,
  type ProgramDetail,
} from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { SelectField } from '../../components/ui/SelectField';
import { TextField } from '../../components/ui/TextField';
import { errorMessage } from '../../features/auth/errorMessage';
import { ExerciseForm } from './ExercisesPage';

// The editor keeps numbers as the strings typed; they are converted on save.
interface ExerciseRow {
  key: number;
  exerciseId: string;
  sets: string;
  target: string;
  restSeconds: string;
  note: string;
}
interface DayRow {
  key: number;
  title: string;
  exercises: ExerciseRow[];
}
interface Draft {
  name: string;
  level: string;
  goal: string;
  days: DayRow[];
}

let nextKey = 1;
const newExercise = (): ExerciseRow => ({
  key: nextKey++,
  exerciseId: '',
  sets: '3',
  target: '',
  restSeconds: '',
  note: '',
});
const newDay = (title = ''): DayRow => ({ key: nextKey++, title, exercises: [newExercise()] });

function toDraft(program: ProgramDetail): Draft {
  return {
    name: program.name,
    level: program.level ?? '',
    goal: program.goal ?? '',
    days: program.days.map((day) => ({
      key: nextKey++,
      title: day.title,
      exercises: day.exercises.map((e) => ({
        key: nextKey++,
        exerciseId: e.exerciseId,
        sets: String(e.sets),
        target: String(e.target),
        restSeconds: e.restSeconds === null ? '' : String(e.restSeconds),
        note: e.note ?? '',
      })),
    })),
  };
}

/** "" -> NaN, so an empty required number fails validation instead of becoming 0. */
const toNumber = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));

function toBody(draft: Draft) {
  return {
    name: draft.name,
    level: draft.level,
    goal: draft.goal,
    days: draft.days.map((day) => ({
      title: day.title,
      exercises: day.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: toNumber(e.sets),
        target: toNumber(e.target),
        restSeconds: e.restSeconds.trim() === '' ? null : toNumber(e.restSeconds),
        note: e.note,
      })),
    })),
  };
}

/** Moves item `from` one step up (-1) or down (+1). */
function move<T>(list: T[], from: number, step: -1 | 1): T[] {
  const to = from + step;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** /admin/programs/new and /admin/programs/:id/edit */
export function ProgramEditorPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const program = useApi<ProgramDetail>(id ? `/programs/${id}` : null);

  if (!id) return <ProgramEditor initial={{ name: '', level: '', goal: '', days: [newDay()] }} />;
  if (program.error) return <p className="text-danger">{errorMessage(program.error, t)}</p>;
  if (!program.data) return <p className="text-muted">{t('common.loading')}</p>;
  return <ProgramEditor id={id} initial={toDraft(program.data)} />;
}

function ProgramEditor({ id, initial }: { id?: string; initial: Draft }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const exercises = useApi<{ exercises: Exercise[] }>('/exercises');
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The exercise row (by key) whose "new exercise" form is open.
  const [addingFor, setAddingFor] = useState<number | null>(null);

  // Exercises already in this program stay selectable even if retired since.
  const usedIds = new Set(initial.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const options = (exercises.data?.exercises ?? []).filter((e) => e.isActive || usedIds.has(e.id));
  const unitOf = (exerciseId: string) => options.find((e) => e.id === exerciseId)?.unit;

  const err = (path: string) => errors[path];

  const updateDay = (dayIndex: number, change: (day: DayRow) => DayRow) =>
    setDraft((d) => ({ ...d, days: d.days.map((day, i) => (i === dayIndex ? change(day) : day)) }));
  const updateExercise = (dayIndex: number, exIndex: number, change: Partial<ExerciseRow>) =>
    updateDay(dayIndex, (day) => ({
      ...day,
      exercises: day.exercises.map((e, i) => (i === exIndex ? { ...e, ...change } : e)),
    }));

  const save = async () => {
    setFormError(null);
    const parsed = programInputSchema.safeParse(toBody(draft));
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join('.')] ??= t(issue.message);
      setErrors(next);
      setFormError(t('programs.fixErrors'));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await apiFetch<ProgramDetail>(id ? `/programs/${id}` : '/programs', {
        method: id ? 'PUT' : 'POST',
        body: parsed.data,
      });
      void navigate(`/admin/programs/${saved.id}`);
    } catch (error) {
      setFormError(errorMessage(error, t));
      setSaving(false);
    }
  };

  const small =
    'min-h-11 min-w-11 rounded-md border border-line text-soft hover:border-soft disabled:opacity-30';

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <h1 className="font-display text-4xl font-bold uppercase">
        {t(id ? 'programs.editTitle' : 'programs.newTitle')}
      </h1>
      {id && <p className="text-sm text-muted">{t('programs.editNote')}</p>}

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <TextField
          label={t('programs.name')}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          error={err('name')}
        />
        <TextField
          label={t('programs.level')}
          hint={t('programs.levelHint')}
          value={draft.level}
          onChange={(e) => setDraft({ ...draft, level: e.target.value })}
          error={err('level')}
        />
      </div>
      <TextField
        label={t('programs.goal')}
        value={draft.goal}
        onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
        error={err('goal')}
      />

      {exercises.error ? <p className="text-danger">{errorMessage(exercises.error, t)}</p> : null}
      {err('days') && <p className="text-sm text-danger">{err('days')}</p>}

      <ol className="flex flex-col gap-5">
        {draft.days.map((day, dayIndex) => (
          <li
            key={day.key}
            className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <TextField
                  label={t('programs.dayTitle', { number: dayIndex + 1 })}
                  placeholder={t('programs.dayTitlePlaceholder')}
                  value={day.title}
                  onChange={(e) => updateDay(dayIndex, (d) => ({ ...d, title: e.target.value }))}
                  error={err(`days.${dayIndex}.title`)}
                />
              </div>
              <button
                type="button"
                className={small}
                disabled={dayIndex === 0}
                onClick={() => setDraft({ ...draft, days: move(draft.days, dayIndex, -1) })}
                aria-label={t('programs.moveUp')}
              >
                ↑
              </button>
              <button
                type="button"
                className={small}
                disabled={dayIndex === draft.days.length - 1}
                onClick={() => setDraft({ ...draft, days: move(draft.days, dayIndex, 1) })}
                aria-label={t('programs.moveDown')}
              >
                ↓
              </button>
              <button
                type="button"
                className={`${small} px-3 hover:text-danger`}
                disabled={draft.days.length === 1}
                onClick={() =>
                  setDraft({ ...draft, days: draft.days.filter((_, i) => i !== dayIndex) })
                }
              >
                {t('programs.removeDay')}
              </button>
            </div>

            {err(`days.${dayIndex}.exercises`) && (
              <p className="text-sm text-danger">{err(`days.${dayIndex}.exercises`)}</p>
            )}

            <ol className="flex flex-col gap-3">
              {day.exercises.map((ex, exIndex) => {
                const path = `days.${dayIndex}.exercises.${exIndex}`;
                const unit = unitOf(ex.exerciseId);
                return (
                  <li
                    key={ex.key}
                    className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-[2fr_repeat(3,minmax(0,1fr))]">
                      <SelectField
                        label={t('programs.exercise')}
                        value={ex.exerciseId}
                        onChange={(e) => {
                          if (e.target.value === '__new__') setAddingFor(ex.key);
                          else updateExercise(dayIndex, exIndex, { exerciseId: e.target.value });
                        }}
                        error={err(`${path}.exerciseId`)}
                      >
                        <option value="">{t('programs.chooseExercise')}</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                            {!o.isActive && ` (${t('exercises.retired')})`}
                          </option>
                        ))}
                        <option value="__new__">{t('programs.newExerciseOption')}</option>
                      </SelectField>
                      <TextField
                        label={t('programs.sets')}
                        type="number"
                        min={1}
                        max={PROGRAM_LIMITS.sets}
                        value={ex.sets}
                        onChange={(e) =>
                          updateExercise(dayIndex, exIndex, { sets: e.target.value })
                        }
                        error={err(`${path}.sets`)}
                      />
                      <TextField
                        label={unit ? t(`programs.targetLabel.${unit}`) : t('programs.target')}
                        type="number"
                        min={1}
                        value={ex.target}
                        onChange={(e) =>
                          updateExercise(dayIndex, exIndex, { target: e.target.value })
                        }
                        error={err(`${path}.target`)}
                      />
                      <TextField
                        label={t('programs.restSeconds')}
                        type="number"
                        min={0}
                        max={PROGRAM_LIMITS.restSeconds}
                        value={ex.restSeconds}
                        onChange={(e) =>
                          updateExercise(dayIndex, exIndex, { restSeconds: e.target.value })
                        }
                        error={err(`${path}.restSeconds`)}
                      />
                    </div>
                    {addingFor === ex.key && (
                      <ExerciseForm
                        onSaved={(created) => {
                          exercises.reload();
                          updateExercise(dayIndex, exIndex, { exerciseId: created.id });
                          setAddingFor(null);
                        }}
                        onCancel={() => setAddingFor(null)}
                      />
                    )}
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-48 flex-1">
                        <TextField
                          label={t('programs.note')}
                          value={ex.note}
                          onChange={(e) =>
                            updateExercise(dayIndex, exIndex, { note: e.target.value })
                          }
                          error={err(`${path}.note`)}
                        />
                      </div>
                      <button
                        type="button"
                        className={small}
                        disabled={exIndex === 0}
                        onClick={() =>
                          updateDay(dayIndex, (d) => ({
                            ...d,
                            exercises: move(d.exercises, exIndex, -1),
                          }))
                        }
                        aria-label={t('programs.moveUp')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={small}
                        disabled={exIndex === day.exercises.length - 1}
                        onClick={() =>
                          updateDay(dayIndex, (d) => ({
                            ...d,
                            exercises: move(d.exercises, exIndex, 1),
                          }))
                        }
                        aria-label={t('programs.moveDown')}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`${small} px-3 hover:text-danger`}
                        onClick={() =>
                          updateDay(dayIndex, (d) => ({
                            ...d,
                            exercises: d.exercises.filter((_, i) => i !== exIndex),
                          }))
                        }
                      >
                        {t('programs.removeExercise')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <Button
              variant="outline"
              className="self-start"
              disabled={day.exercises.length >= PROGRAM_LIMITS.exercisesPerDay}
              onClick={() =>
                updateDay(dayIndex, (d) => ({ ...d, exercises: [...d.exercises, newExercise()] }))
              }
            >
              {t('programs.addExercise')}
            </Button>
          </li>
        ))}
      </ol>

      <Button
        variant="outline"
        className="self-start"
        disabled={draft.days.length >= PROGRAM_LIMITS.days}
        onClick={() => setDraft({ ...draft, days: [...draft.days, newDay()] })}
      >
        {t('programs.addDay')}
      </Button>

      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap gap-3 border-t border-line pt-5">
        <Button disabled={saving} onClick={() => void save()}>
          {t('programs.save')}
        </Button>
        <ButtonLink variant="outline" to={id ? `/admin/programs/${id}` : '/admin/programs'}>
          {t('common.cancel')}
        </ButtonLink>
      </div>
    </section>
  );
}
