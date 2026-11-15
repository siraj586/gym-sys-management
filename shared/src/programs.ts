import { z } from 'zod';

// Validation messages are translation keys, as in auth.ts.

/** Same values as the ExerciseUnit enum in the Prisma schema. */
export const EXERCISE_UNITS = ['REPS', 'SECONDS', 'KG'] as const;
export type ExerciseUnit = (typeof EXERCISE_UNITS)[number];

export const PROGRAM_LIMITS = {
  days: 14,
  exercisesPerDay: 30,
  sets: 20,
  target: 10_000,
  restSeconds: 600,
} as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullish()
    .transform((value) => (value ? value : null));

const wholeNumber = (min: number, max: number, message: string) =>
  z.number({ error: message }).int(message).min(min, message).max(max, message);

// ---------- Exercises ----------

export const exerciseInputSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(80, 'validation.tooLong'),
  unit: z.enum(EXERCISE_UNITS, { error: 'validation.required' }),
  isActive: z.boolean().default(true),
});
export type ExerciseFormInput = z.input<typeof exerciseInputSchema>;
export type ExerciseInput = z.output<typeof exerciseInputSchema>;

export interface Exercise {
  id: string;
  name: string;
  unit: ExerciseUnit;
  isActive: boolean;
}

// ---------- Programs ----------

export const programExerciseInputSchema = z.object({
  exerciseId: z.string().min(1, 'validation.required'),
  sets: wholeNumber(1, PROGRAM_LIMITS.sets, 'validation.sets'),
  target: wholeNumber(1, PROGRAM_LIMITS.target, 'validation.target'),
  restSeconds: wholeNumber(0, PROGRAM_LIMITS.restSeconds, 'validation.rest')
    .nullish()
    .transform((v) => v ?? null),
  note: optionalText(200),
});

export const programDayInputSchema = z.object({
  title: z.string().trim().min(1, 'validation.required').max(80, 'validation.tooLong'),
  exercises: z
    .array(programExerciseInputSchema)
    .min(1, 'validation.dayNeedsExercise')
    .max(PROGRAM_LIMITS.exercisesPerDay, 'validation.tooMany'),
});

/** A whole program: saving it replaces all its days and exercises at once. */
export const programInputSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(80, 'validation.tooLong'),
  level: optionalText(40),
  goal: optionalText(200),
  days: z
    .array(programDayInputSchema)
    .min(1, 'validation.programNeedsDay')
    .max(PROGRAM_LIMITS.days, 'validation.tooMany'),
});
export type ProgramFormInput = z.input<typeof programInputSchema>;
export type ProgramInput = z.output<typeof programInputSchema>;

export const assignProgramSchema = z.object({
  programId: z.string().min(1, 'validation.required'),
});

export interface ProgramExercise {
  exerciseId: string;
  name: string;
  unit: ExerciseUnit;
  sets: number;
  target: number;
  restSeconds: number | null;
  note: string | null;
}

export interface ProgramDay {
  title: string;
  exercises: ProgramExercise[];
}

export interface ProgramSummary {
  id: string;
  name: string;
  level: string | null;
  goal: string | null;
  archivedAt: string | null;
  dayCount: number;
  /** Members following it right now. */
  activeMembers: number;
}

export interface ProgramDetail extends ProgramSummary {
  days: ProgramDay[];
  members: { id: string; firstName: string; lastName: string; assignedAt: string }[];
}

export interface MemberProgramResponse {
  current: { assignedAt: string; program: ProgramDetail } | null;
  history: { programId: string; name: string; assignedAt: string; endedAt: string }[];
}
