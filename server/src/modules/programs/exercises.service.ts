import type { Exercise, ExerciseInput } from '@calisthenics/shared';
import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

const exerciseSelect = {
  id: true,
  name: true,
  unit: true,
  isActive: true,
} satisfies Prisma.ExerciseSelect;

const nameTaken = () =>
  new AppError(409, 'EXERCISE_NAME_TAKEN', 'An exercise with this name already exists.');

/** "Push-up" and "push-up" are the same exercise: refuse the second one. */
async function assertNameFree(name: string, exceptId?: string) {
  const clash = await prisma.exercise.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
    select: { id: true },
  });
  if (clash) throw nameTaken();
}

function rethrowUnique(err: unknown): never {
  // The unique index still decides when two requests race past the check above.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw nameTaken();
  }
  throw err;
}

/** Active exercises first, then by name. */
export function listExercises(): Promise<Exercise[]> {
  return prisma.exercise.findMany({
    select: exerciseSelect,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

export async function createExercise(input: ExerciseInput): Promise<Exercise> {
  await assertNameFree(input.name);
  return prisma.exercise.create({ data: input, select: exerciseSelect }).catch(rethrowUnique);
}

/**
 * Exercises are retired with isActive, never deleted: programs and progress
 * records point at them. Changing the unit of an exercise already in use would
 * change what old targets mean, so it is refused.
 */
export async function updateExercise(id: string, input: ExerciseInput): Promise<Exercise> {
  const current = await prisma.exercise.findUnique({
    where: { id },
    select: {
      unit: true,
      _count: { select: { programExercises: true, performanceRecords: true } },
    },
  });
  if (!current) throw new AppError(404, 'EXERCISE_NOT_FOUND', 'This exercise does not exist.');
  const inUse = current._count.programExercises + current._count.performanceRecords > 0;
  if (inUse && input.unit !== current.unit) {
    throw new AppError(
      409,
      'EXERCISE_UNIT_LOCKED',
      'This exercise is already used, so its unit cannot change.',
    );
  }
  await assertNameFree(input.name, id);
  return prisma.exercise
    .update({ where: { id }, data: input, select: exerciseSelect })
    .catch(rethrowUnique);
}

/**
 * Deletes an exercise for good: it leaves every program that uses it, and the
 * results recorded for it are deleted. A program day left without exercises
 * is removed too. Retiring stays the gentler choice.
 */
export async function deleteExercise(id: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const exercise = await tx.exercise.findUnique({ where: { id }, select: { name: true } });
    if (!exercise) throw new AppError(404, 'EXERCISE_NOT_FOUND', 'This exercise does not exist.');
    const dayIds = (
      await tx.programExercise.findMany({ where: { exerciseId: id }, select: { dayId: true } })
    ).map((e) => e.dayId);
    const inPrograms = await tx.programExercise.deleteMany({ where: { exerciseId: id } });
    const records = await tx.performanceRecord.deleteMany({ where: { exerciseId: id } });
    // Only the days this exercise emptied.
    await tx.programDay.deleteMany({ where: { id: { in: dayIds }, exercises: { none: {} } } });
    await tx.exercise.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'exercise.delete',
        entity: 'Exercise',
        entityId: id,
        meta: { name: exercise.name, inPrograms: inPrograms.count, records: records.count },
      },
    });
  });
}
