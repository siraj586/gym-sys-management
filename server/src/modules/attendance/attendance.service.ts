import {
  addMonths,
  type CheckIn,
  type CheckInListResponse,
  type MemberAttendance,
} from '@calisthenics/shared';
import { Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { gymToday } from '../../lib/settings.js';

const checkInSelect = {
  id: true,
  date: true,
  checkedInAt: true,
  member: { select: { id: true, firstName: true, lastName: true } },
  recordedBy: { select: { email: true } },
} satisfies Prisma.CheckInSelect;

type CheckInRow = Prisma.CheckInGetPayload<{ select: typeof checkInSelect }>;

function toCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    date: fromDbDate(row.date),
    checkedInAt: row.checkedInAt.toISOString(),
    member: row.member,
    recordedBy: row.recordedBy.email,
  };
}

const memberNotFound = () => new AppError(404, 'MEMBER_NOT_FOUND', 'This member does not exist.');

/**
 * Records that a member came on `date` (today by default). Members with an
 * expired or unpaid subscription can still be checked in: the coach decides,
 * and the desk shows a warning. Archived members cannot.
 */
export async function checkIn(
  input: { memberId: string; date?: string },
  recordedById: string,
): Promise<CheckIn> {
  const today = await gymToday();
  const date = input.date ?? today;
  if (date > today) {
    throw new AppError(400, 'CHECK_IN_IN_FUTURE', 'A check-in cannot be dated after today.');
  }

  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    select: { archivedAt: true },
  });
  if (!member) throw memberNotFound();
  if (member.archivedAt) {
    throw new AppError(409, 'MEMBER_ARCHIVED', 'Restore this member before checking them in.');
  }

  try {
    const row = await prisma.checkIn.create({
      data: { memberId: input.memberId, date: toDbDate(date), recordedById },
      select: checkInSelect,
    });
    return toCheckIn(row);
  } catch (err) {
    // The unique index on (memberId, date) decides duplicates, even for two
    // clicks that arrive at the same moment.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'ALREADY_CHECKED_IN', 'This member is already checked in that day.');
    }
    throw err;
  }
}

/** Undo a check-in recorded by mistake. Kept in the audit log. */
export async function removeCheckIn(id: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.checkIn.findUnique({
      where: { id },
      select: { memberId: true, date: true },
    });
    if (!row) throw new AppError(404, 'CHECK_IN_NOT_FOUND', 'This check-in does not exist.');
    await tx.checkIn.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'checkIn.remove',
        entity: 'CheckIn',
        entityId: id,
        meta: { memberId: row.memberId, date: fromDbDate(row.date) },
      },
    });
  });
}

/** Everyone who came on `date` (today by default), latest first. */
export async function listCheckIns(date?: string): Promise<CheckInListResponse> {
  const day = date ?? (await gymToday());
  const rows = await prisma.checkIn.findMany({
    where: { date: toDbDate(day) },
    select: checkInSelect,
    orderBy: { checkedInAt: 'desc' },
  });
  return { date: day, checkIns: rows.map(toCheckIn) };
}

/** One member's visits in `month` (the current month by default). */
export async function memberAttendance(
  memberId: string,
  month?: string,
): Promise<MemberAttendance> {
  const exists = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } });
  if (!exists) throw memberNotFound();

  const m = month ?? (await gymToday()).slice(0, 7);
  const first = `${m}-01`;
  const [inMonth, last, totalVisits] = await Promise.all([
    prisma.checkIn.findMany({
      where: { memberId, date: { gte: toDbDate(first), lt: toDbDate(addMonths(first, 1)) } },
      select: { date: true },
      orderBy: { date: 'asc' },
    }),
    prisma.checkIn.findFirst({
      where: { memberId },
      select: { date: true },
      orderBy: { date: 'desc' },
    }),
    prisma.checkIn.count({ where: { memberId } }),
  ]);

  return {
    month: m,
    days: inMonth.map((c) => fromDbDate(c.date)),
    lastVisit: last ? fromDbDate(last.date) : null,
    totalVisits,
  };
}
