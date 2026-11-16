import type {
  MemberProgramResponse,
  ProgramDetail,
  ProgramInput,
  ProgramSummary,
} from '@calisthenics/shared';
import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

const programNotFound = () =>
  new AppError(404, 'PROGRAM_NOT_FOUND', 'This program does not exist.');
const memberNotFound = () => new AppError(404, 'MEMBER_NOT_FOUND', 'This member does not exist.');

const summarySelect = {
  id: true,
  name: true,
  level: true,
  goal: true,
  archivedAt: true,
  _count: { select: { days: true, assignments: { where: { endedAt: null } } } },
} satisfies Prisma.ProgramSelect;

type SummaryRow = Prisma.ProgramGetPayload<{ select: typeof summarySelect }>;

function toSummary(row: SummaryRow): ProgramSummary {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    goal: row.goal,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    dayCount: row._count.days,
    activeMembers: row._count.assignments,
  };
}

const detailSelect = {
  ...summarySelect,
  days: {
    orderBy: { position: 'asc' },
    select: {
      title: true,
      exercises: {
        orderBy: { position: 'asc' },
        select: {
          exerciseId: true,
          sets: true,
          target: true,
          restSeconds: true,
          note: true,
          exercise: { select: { name: true, unit: true } },
        },
      },
    },
  },
  assignments: {
    where: { endedAt: null },
    orderBy: { assignedAt: 'asc' },
    select: {
      assignedAt: true,
      member: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.ProgramSelect;

export async function listPrograms(archived: boolean): Promise<ProgramSummary[]> {
  const rows = await prisma.program.findMany({
    where: { archivedAt: archived ? { not: null } : null },
    select: summarySelect,
    orderBy: { name: 'asc' },
  });
  return rows.map(toSummary);
}

export async function getProgram(
  id: string,
  db: Prisma.TransactionClient = prisma,
): Promise<ProgramDetail> {
  const row = await db.program.findUnique({ where: { id }, select: detailSelect });
  if (!row) throw programNotFound();
  return {
    ...toSummary(row),
    days: row.days.map((day) => ({
      title: day.title,
      exercises: day.exercises.map(({ exercise, ...e }) => ({ ...e, ...exercise })),
    })),
    members: row.assignments.map((a) => ({ ...a.member, assignedAt: a.assignedAt.toISOString() })),
  };
}

/**
 * Every exercise must exist. A retired exercise may stay in a program that
 * already had it, but cannot be added anew.
 */
async function assertExercisesUsable(
  tx: Prisma.TransactionClient,
  input: ProgramInput,
  programId?: string,
) {
  const ids = [...new Set(input.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
  const [found, alreadyUsed] = await Promise.all([
    tx.exercise.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true } }),
    programId
      ? tx.programExercise.findMany({
          where: { day: { programId } },
          select: { exerciseId: true },
          distinct: ['exerciseId'],
        })
      : [],
  ]);
  const byId = new Map(found.map((e) => [e.id, e]));
  const kept = new Set(alreadyUsed.map((e) => e.exerciseId));
  for (const id of ids) {
    const exercise = byId.get(id);
    if (!exercise) {
      throw new AppError(400, 'EXERCISE_NOT_FOUND', 'One of the exercises does not exist.', { id });
    }
    if (!exercise.isActive && !kept.has(id)) {
      throw new AppError(409, 'EXERCISE_INACTIVE', 'One of the exercises is retired.', { id });
    }
  }
}

/** Days and exercises in the order they were sent; positions are their indexes. */
function daysData(input: ProgramInput) {
  return {
    create: input.days.map((day, dayIndex) => ({
      position: dayIndex,
      title: day.title,
      exercises: {
        create: day.exercises.map((e, index) => ({ ...e, position: index })),
      },
    })),
  };
}

export async function createProgram(input: ProgramInput): Promise<ProgramDetail> {
  return prisma.$transaction(async (tx) => {
    await assertExercisesUsable(tx, input);
    const { id } = await tx.program.create({
      data: { name: input.name, level: input.level, goal: input.goal, days: daysData(input) },
      select: { id: true },
    });
    return getProgram(id, tx);
  });
}

/**
 * Replaces the whole program in one transaction. Members keep following it:
 * their assignment points at the program, not at its days.
 */
export async function updateProgram(id: string, input: ProgramInput): Promise<ProgramDetail> {
  return prisma.$transaction(async (tx) => {
    const exists = await tx.program.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw programNotFound();
    await assertExercisesUsable(tx, input, id);
    await tx.programDay.deleteMany({ where: { programId: id } }); // exercises cascade
    await tx.program.update({
      where: { id },
      data: { name: input.name, level: input.level, goal: input.goal, days: daysData(input) },
    });
    return getProgram(id, tx);
  });
}

/** A copy of a program with all its days, named "<name> (copy)", assigned to nobody. */
export async function duplicateProgram(id: string, copySuffix: string): Promise<ProgramDetail> {
  const source = await getProgram(id);
  return prisma.$transaction(async (tx) => {
    const { id: copyId } = await tx.program.create({
      data: {
        name: `${source.name}${copySuffix}`.slice(0, 80),
        level: source.level,
        goal: source.goal,
        days: {
          create: source.days.map((day, dayIndex) => ({
            position: dayIndex,
            title: day.title,
            exercises: {
              create: day.exercises.map((e, index) => ({
                exerciseId: e.exerciseId,
                sets: e.sets,
                target: e.target,
                restSeconds: e.restSeconds,
                note: e.note,
                position: index,
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
    return getProgram(copyId, tx);
  });
}

/** Archived programs cannot be assigned anew; members already on one keep it. */
export async function setArchived(id: string, archived: boolean): Promise<ProgramDetail> {
  const { count } = await prisma.program.updateMany({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) throw programNotFound();
  return getProgram(id);
}

// ---------- Member assignments ----------

export async function getMemberProgram(memberId: string): Promise<MemberProgramResponse> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      programs: {
        orderBy: { assignedAt: 'desc' },
        select: {
          programId: true,
          assignedAt: true,
          endedAt: true,
          program: { select: { name: true } },
        },
      },
    },
  });
  if (!member) throw memberNotFound();

  const current = member.programs.find((p) => !p.endedAt);
  return {
    current: current
      ? {
          assignedAt: current.assignedAt.toISOString(),
          program: await getProgram(current.programId),
        }
      : null,
    history: member.programs
      .filter((p) => p.endedAt)
      .map((p) => ({
        programId: p.programId,
        name: p.program.name,
        assignedAt: p.assignedAt.toISOString(),
        endedAt: p.endedAt!.toISOString(),
      })),
  };
}

/**
 * Puts a member on a program. The previous one (if any) ends at the same
 * moment, so a member always has at most one current program.
 */
export async function assignProgram(
  memberId: string,
  programId: string,
): Promise<MemberProgramResponse> {
  await prisma.$transaction(async (tx) => {
    // Locking the member row makes two assignments for the same member run one
    // after the other, so they can never leave two current programs.
    const [member] = await tx.$queryRaw<{ archivedAt: Date | null }[]>`
      SELECT "archivedAt" FROM "Member" WHERE id = ${memberId} FOR UPDATE`;
    if (!member) throw memberNotFound();
    if (member.archivedAt) {
      throw new AppError(409, 'MEMBER_ARCHIVED', 'Restore this member first.');
    }

    const program = await tx.program.findUnique({
      where: { id: programId },
      select: { archivedAt: true },
    });
    if (!program) throw new AppError(400, 'PROGRAM_NOT_FOUND', 'This program does not exist.');
    if (program.archivedAt) {
      throw new AppError(409, 'PROGRAM_ARCHIVED', 'This program is archived.');
    }

    const current = await tx.memberProgram.findFirst({
      where: { memberId, endedAt: null },
      select: { id: true, programId: true },
    });
    if (current?.programId === programId) {
      throw new AppError(
        409,
        'PROGRAM_ALREADY_ASSIGNED',
        'The member already follows this program.',
      );
    }
    const now = new Date();
    if (current) {
      await tx.memberProgram.update({ where: { id: current.id }, data: { endedAt: now } });
    }
    await tx.memberProgram.create({ data: { memberId, programId, assignedAt: now } });
  });
  return getMemberProgram(memberId);
}

/** Ends the member's current program without starting another. */
export async function endProgram(memberId: string): Promise<MemberProgramResponse> {
  const member = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!member) throw memberNotFound();
  const { count } = await prisma.memberProgram.updateMany({
    where: { memberId, endedAt: null },
    data: { endedAt: new Date() },
  });
  if (count === 0) {
    throw new AppError(409, 'NO_CURRENT_PROGRAM', 'This member has no current program.');
  }
  return getMemberProgram(memberId);
}

/**
 * Deletes a program for good: its days, and every assignment of it (members
 * who follow it are left without a program; past assignments disappear from
 * their history). Archiving stays the gentler choice.
 */
export async function deleteProgram(id: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const program = await tx.program.findUnique({ where: { id }, select: { name: true } });
    if (!program) throw programNotFound();
    const assignments = await tx.memberProgram.deleteMany({ where: { programId: id } });
    await tx.program.delete({ where: { id } }); // days and their exercises cascade
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'program.delete',
        entity: 'Program',
        entityId: id,
        meta: { name: program.name, assignments: assignments.count },
      },
    });
  });
}
