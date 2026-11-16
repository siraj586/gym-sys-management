import {
  type BodyMeasurement,
  type ExerciseProgress,
  type MeasurementInput,
  type MemberProgress,
  type PerformanceInput,
  type ProgressNote,
} from '@calisthenics/shared';
import type { Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { gymToday } from '../../lib/settings.js';

const memberNotFound = () => new AppError(404, 'MEMBER_NOT_FOUND', 'This member does not exist.');

async function assertMember(memberId: string) {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!member) throw memberNotFound();
}

async function assertNotFuture(date: string) {
  if (date > (await gymToday())) {
    throw new AppError(400, 'DATE_IN_FUTURE', 'This date is after today.');
  }
}

const measurementSelect = {
  id: true,
  recordedAt: true,
  note: true,
  weightKg: true,
  bodyFatPct: true,
  chestCm: true,
  waistCm: true,
  armCm: true,
  thighCm: true,
} satisfies Prisma.BodyMeasurementSelect;

function toMeasurement(
  row: Prisma.BodyMeasurementGetPayload<{ select: typeof measurementSelect }>,
): BodyMeasurement {
  return { ...row, recordedAt: fromDbDate(row.recordedAt) };
}

/** Everything on the progress page in one request. */
export async function getProgress(memberId: string): Promise<MemberProgress> {
  await assertMember(memberId);
  const [records, measurements, notes] = await Promise.all([
    prisma.performanceRecord.findMany({
      where: { memberId },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        value: true,
        recordedAt: true,
        note: true,
        exercise: { select: { id: true, name: true, unit: true } },
      },
    }),
    prisma.bodyMeasurement.findMany({
      where: { memberId },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      select: measurementSelect,
    }),
    prisma.progressNote.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, body: true, createdAt: true },
    }),
  ]);

  // Group the records by exercise, keeping each group oldest first.
  const byExercise = new Map<string, ExerciseProgress>();
  for (const { exercise, ...r } of records) {
    const record = { ...r, recordedAt: fromDbDate(r.recordedAt) };
    const group = byExercise.get(exercise.id);
    if (group) {
      group.records.push(record);
      group.best = Math.max(group.best, record.value);
      group.latest = record.value;
    } else {
      byExercise.set(exercise.id, {
        exerciseId: exercise.id,
        name: exercise.name,
        unit: exercise.unit,
        best: record.value,
        first: record.value,
        latest: record.value,
        records: [record],
      });
    }
  }

  return {
    exercises: [...byExercise.values()].sort((a, b) => a.name.localeCompare(b.name)),
    measurements: measurements.map(toMeasurement),
    notes: notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
  };
}

/**
 * Records a result. Reps and seconds are whole numbers. A retired exercise can
 * still be recorded for a member who already has results in it, so a long
 * history is not cut off, but cannot be started anew.
 */
export async function addPerformance(memberId: string, input: PerformanceInput): Promise<void> {
  await assertMember(memberId);
  await assertNotFuture(input.recordedAt);

  const exercise = await prisma.exercise.findUnique({
    where: { id: input.exerciseId },
    select: {
      unit: true,
      isActive: true,
      _count: { select: { performanceRecords: { where: { memberId } } } },
    },
  });
  if (!exercise) throw new AppError(400, 'EXERCISE_NOT_FOUND', 'This exercise does not exist.');
  if (!exercise.isActive && exercise._count.performanceRecords === 0) {
    throw new AppError(409, 'EXERCISE_INACTIVE', 'This exercise is retired.');
  }
  if (exercise.unit !== 'KG' && !Number.isInteger(input.value)) {
    throw new AppError(400, 'VALUE_NOT_WHOLE', 'Reps and seconds are whole numbers.');
  }

  await prisma.performanceRecord.create({
    data: { ...input, memberId, recordedAt: toDbDate(input.recordedAt) },
  });
}

export async function addMeasurement(memberId: string, input: MeasurementInput): Promise<void> {
  await assertMember(memberId);
  await assertNotFuture(input.recordedAt);
  await prisma.bodyMeasurement.create({
    data: { ...input, memberId, recordedAt: toDbDate(input.recordedAt) },
  });
}

export async function addNote(memberId: string, body: string): Promise<ProgressNote> {
  await assertMember(memberId);
  const row = await prisma.progressNote.create({
    data: { memberId, body },
    select: { id: true, body: true, createdAt: true },
  });
  return { ...row, createdAt: row.createdAt.toISOString() };
}

// ---------- Removing entries made by mistake ----------

type Entity = 'PerformanceRecord' | 'BodyMeasurement' | 'ProgressNote';

/** Deletes one entry and keeps a copy of it in the audit log. */
export async function removeEntry(entity: Entity, id: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row =
      entity === 'PerformanceRecord'
        ? await tx.performanceRecord.findUnique({ where: { id } })
        : entity === 'BodyMeasurement'
          ? await tx.bodyMeasurement.findUnique({ where: { id } })
          : await tx.progressNote.findUnique({ where: { id } });
    if (!row) throw new AppError(404, 'ENTRY_NOT_FOUND', 'This entry does not exist any more.');

    if (entity === 'PerformanceRecord') await tx.performanceRecord.delete({ where: { id } });
    else if (entity === 'BodyMeasurement') await tx.bodyMeasurement.delete({ where: { id } });
    else await tx.progressNote.delete({ where: { id } });

    await tx.auditLog.create({
      data: {
        actorId,
        action: 'progress.remove',
        entity,
        entityId: id,
        // The removed row itself, so a mistake in the mistake can be undone by hand.
        meta: JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue,
      },
    });
  });
}
