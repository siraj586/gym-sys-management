import { z } from 'zod';
import { isIsoDate } from './dates.js';
import type { ExerciseUnit } from './programs.js';

// Validation messages are translation keys, as in auth.ts.

const isoDate = z.string().trim().refine(isIsoDate, 'validation.date');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullish()
    .transform((value) => (value ? value : null));

// ---------- Performance ----------

export const performanceInputSchema = z.object({
  exerciseId: z.string().min(1, 'validation.required'),
  /** Reps and seconds must be whole numbers; the server checks that against the unit. */
  value: z
    .number({ error: 'validation.value' })
    .gt(0, 'validation.value')
    .max(10_000, 'validation.value')
    .multipleOf(0.01, 'validation.value'),
  recordedAt: isoDate,
  note: optionalText(200),
});
export type PerformanceInput = z.output<typeof performanceInputSchema>;

export interface PerformanceRecord {
  id: string;
  value: number;
  recordedAt: string;
  note: string | null;
}

/** All of one member's results in one exercise, oldest first. */
export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  unit: ExerciseUnit;
  best: number;
  first: number;
  latest: number;
  records: PerformanceRecord[];
}

// ---------- Body measurements ----------

/** Field -> [min, max]. Wide enough for any adult, narrow enough to catch typos. */
export const MEASUREMENT_RANGES = {
  weightKg: [20, 400],
  bodyFatPct: [2, 70],
  chestCm: [30, 250],
  waistCm: [30, 250],
  armCm: [10, 100],
  thighCm: [20, 150],
} as const;
export type MeasurementField = keyof typeof MEASUREMENT_RANGES;
export const MEASUREMENT_FIELDS = Object.keys(MEASUREMENT_RANGES) as MeasurementField[];

const measurement = (field: MeasurementField) =>
  z
    .number({ error: 'validation.measurement' })
    .min(MEASUREMENT_RANGES[field][0], 'validation.measurement')
    .max(MEASUREMENT_RANGES[field][1], 'validation.measurement')
    .nullish()
    .transform((v) => v ?? null);

export const measurementInputSchema = z
  .object({
    recordedAt: isoDate,
    weightKg: measurement('weightKg'),
    bodyFatPct: measurement('bodyFatPct'),
    chestCm: measurement('chestCm'),
    waistCm: measurement('waistCm'),
    armCm: measurement('armCm'),
    thighCm: measurement('thighCm'),
    note: optionalText(200),
  })
  .refine((m) => MEASUREMENT_FIELDS.some((f) => m[f] !== null), {
    message: 'validation.measurementEmpty',
    path: ['weightKg'],
  });
export type MeasurementInput = z.output<typeof measurementInputSchema>;

export type BodyMeasurement = { id: string; recordedAt: string; note: string | null } & Record<
  MeasurementField,
  number | null
>;

// ---------- Notes ----------

export const progressNoteInputSchema = z.object({
  body: z.string().trim().min(1, 'validation.required').max(2000, 'validation.tooLong'),
});

export interface ProgressNote {
  id: string;
  body: string;
  createdAt: string;
}

// ---------- One response for the progress page ----------

export interface MemberProgress {
  exercises: ExerciseProgress[];
  /** Newest first. */
  measurements: BodyMeasurement[];
  /** Newest first. */
  notes: ProgressNote[];
}
