import {
  EXERCISE_UNITS,
  exerciseInputSchema,
  type Exercise,
  type ExerciseUnit,
} from '@calisthenics/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { SelectField } from '../../components/ui/SelectField';
import { TextField } from '../../components/ui/TextField';
import { errorMessage } from '../../features/auth/errorMessage';

export function ExercisesPage() {
  const { t } = useTranslation();
  const { data, error, reload } = useApi<{ exercises: Exercise[] }>('/exercises');
  // null: nothing open; 'new': the add form; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);

  const saved = () => {
    setEditing(null);
    reload();
  };

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <Link to="/admin/programs" className="self-start text-sm text-muted hover:text-fg">
        {t('programs.backToList')}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-bold uppercase">{t('exercises.title')}</h1>
          <p className="text-sm text-muted">{t('exercises.intro')}</p>
        </div>
        {editing !== 'new' && (
          <Button onClick={() => setEditing('new')}>{t('exercises.add')}</Button>
        )}
      </div>

      {editing === 'new' && <ExerciseForm onSaved={saved} onCancel={() => setEditing(null)} />}

      {error ? (
        <p className="text-danger">{errorMessage(error, t)}</p>
      ) : !data ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : data.exercises.length === 0 ? (
        editing !== 'new' && (
          <p className="rounded-lg border border-line p-6 text-center text-muted">
            {t('exercises.empty')}
          </p>
        )
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {data.exercises.map((ex) =>
            editing === ex.id ? (
              <li key={ex.id} className="p-3">
                <ExerciseForm exercise={ex} onSaved={saved} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li
                key={ex.id}
                className={`flex items-center justify-between gap-3 px-4 py-2 ${ex.isActive ? '' : 'opacity-60'}`}
              >
                <span className="flex flex-col">
                  <span className="font-semibold">{ex.name}</span>
                  <span className="text-sm text-muted">
                    {t(`programs.unit.${ex.unit}`)}
                    {!ex.isActive && ` · ${t('exercises.retired')}`}
                  </span>
                </span>
                <Button variant="outline" onClick={() => setEditing(ex.id)}>
                  {t('common.edit')}
                </Button>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** Add or edit one exercise. Also used inside the program editor for a quick add. */
export function ExerciseForm({
  exercise,
  onSaved,
  onCancel,
}: {
  exercise?: Exercise;
  onSaved: (saved: Exercise) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(exercise?.name ?? '');
  const [unit, setUnit] = useState<ExerciseUnit>(exercise?.unit ?? 'REPS');
  const [isActive, setIsActive] = useState(exercise?.isActive ?? true);
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = exerciseInputSchema.safeParse({ name, unit, isActive });
    setNameError(parsed.success ? undefined : t(parsed.error.issues[0]!.message));
    if (!parsed.success) return;

    setSaving(true);
    try {
      const saved = await apiFetch<Exercise>(
        exercise ? `/exercises/${exercise.id}` : '/exercises',
        { method: exercise ? 'PUT' : 'POST', body: parsed.data },
      );
      onSaved(saved);
    } catch (error) {
      setFormError(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="flex flex-col gap-3 rounded-md border border-lime-dim bg-surface-2 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <TextField
          label={t('exercises.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
          autoFocus
        />
        <SelectField
          label={t('exercises.unit')}
          value={unit}
          onChange={(e) => setUnit(e.target.value as ExerciseUnit)}
        >
          {EXERCISE_UNITS.map((u) => (
            <option key={u} value={u}>
              {t(`programs.unit.${u}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {exercise && (
        <label className="flex items-center gap-2 text-sm text-soft">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 accent-lime"
          />
          {t('exercises.active')}
        </label>
      )}
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          {t('common.save')}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
