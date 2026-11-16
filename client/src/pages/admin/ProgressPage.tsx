import {
  MEASUREMENT_FIELDS,
  measurementInputSchema,
  performanceInputSchema,
  type BodyMeasurement,
  type Exercise,
  type ExerciseProgress,
  type ExerciseUnit,
  type MeasurementField,
  type MemberDetail,
  type MemberProgress,
} from '@calisthenics/shared';
import type { TFunction } from 'i18next';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { LineChart } from '../../components/charts/LineChart';
import { Button } from '../../components/ui/Button';
import { SelectField } from '../../components/ui/SelectField';
import { TextAreaField } from '../../components/ui/TextAreaField';
import { TextField } from '../../components/ui/TextField';
import { errorMessage } from '../../features/auth/errorMessage';
import { useSettings } from '../../features/settings/SettingsContext';
import { formatDate } from '../../lib/format';

const TABS = ['performance', 'body', 'notes'] as const;
type Tab = (typeof TABS)[number];

/** "12 reps", "45 s", "7.5 kg" */
const formatResult = (t: TFunction, unit: ExerciseUnit, value: number) =>
  t(`programs.unitValue.${unit}`, { count: value });

/** "80.1 kg", "18 %", "92 cm" */
const formatMeasure = (t: TFunction, field: MeasurementField, value: number) =>
  t(`progress.measureValue.${field}`, { value });

/** Numbers typed in a form: "" -> undefined (not given), "7,5" -> 7.5, "abc" -> NaN. */
const parseNumber = (value: string) =>
  value.trim() === '' ? undefined : Number(value.trim().replace(',', '.'));

/** Deletes one entry after a confirmation; used by every list on this page. */
function useRemove(onDone: () => void) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const remove = async (path: string) => {
    if (!window.confirm(t('progress.confirmRemove'))) return;
    setError(null);
    try {
      await apiFetch(`/progress/${path}`, { method: 'DELETE' });
      onDone();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  };
  return { remove, error };
}

export function ProgressPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab)
    ? (params.get('tab') as Tab)
    : 'performance';
  const member = useApi<MemberDetail>(`/members/${id}`);
  const progress = useApi<MemberProgress>(`/members/${id}/progress`);

  const error = member.error ?? progress.error;
  if (error) return <p className="text-danger">{errorMessage(error, t)}</p>;
  if (!member.data || !progress.data) return <p className="text-muted">{t('common.loading')}</p>;

  const tabClass = (name: Tab) =>
    `min-h-11 px-4 text-sm font-semibold ${tab === name ? 'bg-lime text-ink' : 'text-fg'}`;

  return (
    <div className="flex flex-col gap-6">
      <Link to={`/admin/members/${id}`} className="self-start text-sm text-muted hover:text-fg">
        {t('progress.backToMember', { name: member.data.firstName })}
      </Link>
      <h1 className="font-display text-4xl font-bold uppercase">
        {t('progress.title', { name: `${member.data.firstName} ${member.data.lastName}` })}
      </h1>

      <div role="tablist" className="flex self-start overflow-hidden rounded-lg border border-line">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tabClass(name)}
            onClick={() =>
              setParams(name === 'performance' ? {} : { tab: name }, { replace: true })
            }
          >
            {t(`progress.tabs.${name}`)}
          </button>
        ))}
      </div>

      {tab === 'performance' && (
        <PerformanceTab memberId={id} progress={progress.data} reload={progress.reload} />
      )}
      {tab === 'body' && (
        <BodyTab memberId={id} measurements={progress.data.measurements} reload={progress.reload} />
      )}
      {tab === 'notes' && (
        <NotesTab memberId={id} notes={progress.data.notes} reload={progress.reload} />
      )}
    </div>
  );
}

// ---------- Performance ----------

function PerformanceTab({
  memberId,
  progress,
  reload,
}: {
  memberId: string;
  progress: MemberProgress;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const { remove, error } = useRemove(reload);

  return (
    <div className="flex flex-col gap-6">
      <AddPerformance memberId={memberId} tracked={progress.exercises} onAdded={reload} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {progress.exercises.length === 0 ? (
        <p className="rounded-lg border border-line p-6 text-center text-muted">
          {t('progress.noResults')}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {progress.exercises.map((ex) => (
            <ExerciseCard
              key={ex.exerciseId}
              exercise={ex}
              onRemove={(rid) => void remove(`performance/${rid}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ExerciseCard({
  exercise: ex,
  onRemove,
}: {
  exercise: ExerciseProgress;
  onRemove: (recordId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const fmt = (v: number) => formatResult(t, ex.unit, v);
  const change = ex.latest - ex.first;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="font-display text-2xl font-bold uppercase">{ex.name}</h2>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <Stat label={t('progress.latest')} value={fmt(ex.latest)} />
        <Stat label={t('progress.best')} value={fmt(ex.best)} />
        <Stat
          label={t('progress.sinceFirst')}
          value={ex.records.length > 1 ? `${change > 0 ? '+' : ''}${fmt(change)}` : '—'}
        />
      </dl>
      {ex.records.length > 1 ? (
        <LineChart
          points={ex.records.map((r) => ({ date: r.recordedAt, value: r.value }))}
          label={t('progress.chartLabel', { name: ex.name })}
          formatValue={fmt}
          formatDate={(d) => formatDate(d, i18n.language)}
        />
      ) : (
        <p className="text-sm text-muted">{t('progress.oneResult')}</p>
      )}
      {/* The table view: every value the chart shows, without hovering. */}
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-soft hover:text-fg">
          {t('progress.allResults', { count: ex.records.length })}
        </summary>
        <ul className="flex flex-col divide-y divide-line text-sm">
          {[...ex.records].reverse().map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span className="flex flex-wrap gap-x-3">
                <span className="w-28 text-muted">{formatDate(r.recordedAt, i18n.language)}</span>
                <span className="font-semibold">{fmt(r.value)}</span>
                {r.note && <span className="text-muted">{r.note}</span>}
              </span>
              <RemoveButton onClick={() => onRemove(r.id)} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function AddPerformance({
  memberId,
  tracked,
  onAdded,
}: {
  memberId: string;
  tracked: ExerciseProgress[];
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const { today } = useSettings();
  const library = useApi<{ exercises: Exercise[] }>('/exercises');
  const trackedIds = new Set(tracked.map((e) => e.exerciseId));
  // Retired exercises stay available for members who already track them.
  const options = (library.data?.exercises ?? []).filter((e) => e.isActive || trackedIds.has(e.id));

  const [exerciseId, setExerciseId] = useState('');
  const [value, setValue] = useState('');
  const [recordedAt, setRecordedAt] = useState(today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const unit = options.find((e) => e.id === exerciseId)?.unit;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = performanceInputSchema.safeParse({
      exerciseId,
      value: parseNumber(value),
      recordedAt,
      note,
    });
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= t(issue.message);
    } else if (unit !== 'KG' && !Number.isInteger(parsed.data.value)) {
      next.value = t('errors.VALUE_NOT_WHOLE');
    }
    setErrors(next);
    if (!parsed.success || Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await apiFetch(`/members/${memberId}/progress/performance`, {
        method: 'POST',
        body: parsed.data,
      });
      setValue('');
      setNote('');
      onAdded();
    } catch (err) {
      setFormError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
    >
      <h2 className="font-semibold">{t('progress.addResult')}</h2>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <SelectField
          label={t('programs.exercise')}
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          error={errors.exerciseId}
        >
          <option value="">{t('programs.chooseExercise')}</option>
          {options.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label={unit ? t(`programs.targetLabel.${unit}`) : t('progress.value')}
          inputMode="decimal"
          dir="ltr"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={errors.value}
        />
        <TextField
          label={t('progress.date')}
          type="date"
          max={today}
          value={recordedAt}
          onChange={(e) => setRecordedAt(e.target.value)}
          error={errors.recordedAt}
        />
      </div>
      <TextField
        label={t('programs.note')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={errors.note}
      />
      {options.length === 0 && library.data && (
        <p className="text-sm text-soft">
          <Link to="/admin/exercises" className="text-lime underline">
            {t('progress.addExercisesFirst')}
          </Link>
        </p>
      )}
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={saving} className="self-start">
        {t('progress.saveResult')}
      </Button>
    </form>
  );
}

// ---------- Body ----------

function BodyTab({
  memberId,
  measurements,
  reload,
}: {
  memberId: string;
  measurements: BodyMeasurement[];
  reload: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { remove, error } = useRemove(reload);
  // Fields that have at least two values can be charted; one at a time (one series).
  const chartable = MEASUREMENT_FIELDS.filter(
    (f) => measurements.filter((m) => m[f] !== null).length > 1,
  );
  const [field, setField] = useState<MeasurementField>('weightKg');
  const charted = chartable.includes(field) ? field : chartable[0];

  return (
    <div className="flex flex-col gap-6">
      <AddMeasurement memberId={memberId} onAdded={reload} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {charted && (
        <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('progress.chooseMeasure')}
          >
            {chartable.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={f === charted}
                onClick={() => setField(f)}
                className={`min-h-9 rounded-full border px-3 text-sm ${f === charted ? 'border-lime bg-lime text-ink' : 'border-line text-soft hover:border-soft'}`}
              >
                {t(`progress.measure.${f}`)}
              </button>
            ))}
          </div>
          <LineChart
            points={measurements
              .filter((m) => m[charted] !== null)
              .map((m) => ({ date: m.recordedAt, value: m[charted]! }))
              .reverse()}
            label={t('progress.chartLabel', { name: t(`progress.measure.${charted}`) })}
            formatValue={(v) => formatMeasure(t, charted, v)}
            formatDate={(d) => formatDate(d, i18n.language)}
          />
        </section>
      )}

      {measurements.length === 0 ? (
        <p className="rounded-lg border border-line p-6 text-center text-muted">
          {t('progress.noMeasurements')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="border-b border-line text-start text-muted">
                <th className="px-3 py-2 text-start font-normal">{t('progress.date')}</th>
                {MEASUREMENT_FIELDS.map((f) => (
                  <th key={f} className="px-3 py-2 text-start font-normal">
                    {t(`progress.measure.${f}`)}
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {measurements.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">
                    {formatDate(m.recordedAt, i18n.language)}
                    {m.note && <span className="block text-xs text-muted">{m.note}</span>}
                  </td>
                  {MEASUREMENT_FIELDS.map((f) => (
                    <td key={f} className="whitespace-nowrap px-3 py-2">
                      {m[f] === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        formatMeasure(t, f, m[f])
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-1 text-end">
                    <RemoveButton onClick={() => void remove(`measurements/${m.id}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddMeasurement({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const { t } = useTranslation();
  const { today } = useSettings();
  const empty = Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f, ''])) as Record<
    MeasurementField,
    string
  >;
  const [values, setValues] = useState(empty);
  const [recordedAt, setRecordedAt] = useState(today);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = measurementInputSchema.safeParse({
      recordedAt,
      note,
      ...Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f, parseNumber(values[f])])),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= t(issue.message);
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await apiFetch(`/members/${memberId}/progress/measurements`, {
        method: 'POST',
        body: parsed.data,
      });
      setValues(empty);
      setNote('');
      onAdded();
    } catch (err) {
      setFormError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
    >
      <h2 className="font-semibold">{t('progress.addMeasurement')}</h2>
      <p className="text-sm text-muted">{t('progress.measurementHint')}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextField
          label={t('progress.date')}
          type="date"
          max={today}
          value={recordedAt}
          onChange={(e) => setRecordedAt(e.target.value)}
          error={errors.recordedAt}
        />
        {MEASUREMENT_FIELDS.map((f) => (
          <TextField
            key={f}
            label={t(`progress.measureWithUnit.${f}`)}
            inputMode="decimal"
            dir="ltr"
            value={values[f]}
            onChange={(e) => setValues({ ...values, [f]: e.target.value })}
            error={errors[f]}
          />
        ))}
      </div>
      <TextField
        label={t('programs.note')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={saving} className="self-start">
        {t('progress.saveMeasurement')}
      </Button>
    </form>
  );
}

// ---------- Notes ----------

function NotesTab({
  memberId,
  notes,
  reload,
}: {
  memberId: string;
  notes: MemberProgress['notes'];
  reload: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { remove, error } = useRemove(reload);
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      setFormError(t('validation.required'));
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await apiFetch(`/members/${memberId}/progress/notes`, { method: 'POST', body: { body } });
      setBody('');
      reload();
    } catch (err) {
      setFormError(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <form
        onSubmit={(e) => void submit(e)}
        noValidate
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
      >
        <TextAreaField
          label={t('progress.newNote')}
          hint={t('progress.noteHint')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          error={formError ?? undefined}
          maxLength={2000}
        />
        <Button type="submit" disabled={saving} className="self-start">
          {t('progress.saveNote')}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {notes.length === 0 ? (
        <p className="text-muted">{t('progress.noNotes')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted">
                  {formatDate(n.createdAt.slice(0, 10), i18n.language)}
                </span>
                <RemoveButton onClick={() => void remove(`notes/${n.id}`)} />
              </div>
              <p className="whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Small pieces ----------

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 px-2 text-sm text-muted hover:text-danger"
    >
      {t('progress.remove')}
    </button>
  );
}
