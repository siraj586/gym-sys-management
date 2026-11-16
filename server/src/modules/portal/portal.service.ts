import {
  addMonths,
  daysBetween,
  memberStatus,
  subscriptionStatus,
  type PortalAttendance,
  type PortalHome,
  type PortalProfile,
  type PortalProfileInput,
  type PortalSubscription,
} from '@calisthenics/shared';
import { fromDbDate, toDbDate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { gymToday } from '../../lib/settings.js';
import { getProgram } from '../programs/programs.service.js';
import { getProgress } from '../progress/progress.service.js';

/** The member profile of the signed-in client. */
async function memberOf(userId: string) {
  const member = await prisma.member.findUnique({
    where: { userId },
    select: { id: true, firstName: true },
  });
  if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'No member profile for this account.');
  return member;
}

function monthRange(month: string) {
  const first = `${month}-01`;
  return { gte: toDbDate(first), lt: toDbDate(addMonths(first, 1)) };
}

export async function home(userId: string): Promise<PortalHome> {
  const member = await memberOf(userId);
  const today = await gymToday();

  const [subs, assignment, visitsThisMonth, recent, progress] = await Promise.all([
    prisma.subscription.findMany({
      where: { memberId: member.id, cancelledAt: null },
      orderBy: { startDate: 'asc' },
      select: {
        planName: true,
        priceCents: true,
        startDate: true,
        endDate: true,
        cancelledAt: true,
        payments: {
          where: { voidedAt: null },
          orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: { amountCents: true, method: true, paidAt: true },
        },
      },
    }),
    prisma.memberProgram.findFirst({
      where: { memberId: member.id, endedAt: null },
      select: { programId: true, assignedAt: true },
    }),
    prisma.checkIn.count({ where: { memberId: member.id, date: monthRange(today.slice(0, 7)) } }),
    prisma.checkIn.findMany({
      where: { memberId: member.id },
      orderBy: { date: 'desc' },
      take: 5,
      select: { date: true, checkedInAt: true },
    }),
    getProgress(member.id),
  ]);

  const periods = subs.map((s) => ({
    ...s,
    startDate: fromDbDate(s.startDate),
    endDate: fromDbDate(s.endDate),
    cancelledAt: null,
  }));
  const shown =
    periods.find((s) => s.startDate <= today && s.endDate >= today) ??
    periods.find((s) => s.startDate > today) ??
    periods[periods.length - 1];

  let subscription: PortalSubscription | null = null;
  if (shown) {
    const payment = shown.payments[0];
    subscription = {
      planName: shown.planName,
      priceCents: shown.priceCents,
      startDate: shown.startDate,
      endDate: shown.endDate,
      status: subscriptionStatus(shown, today),
      daysLeft: daysBetween(today, shown.endDate),
      totalDays: daysBetween(shown.startDate, shown.endDate),
      lastPayment: payment
        ? {
            amountCents: payment.amountCents,
            method: payment.method,
            paidAt: fromDbDate(payment.paidAt),
          }
        : null,
    };
  }

  let program: PortalHome['program'] = null;
  if (assignment) {
    // Only the program itself: never the list of other members who follow it.
    const { name, level, goal, days } = await getProgram(assignment.programId);
    program = { name, level, goal, days, assignedAt: assignment.assignedAt.toISOString() };
  }

  return {
    firstName: member.firstName,
    status: memberStatus(periods, today),
    subscription,
    program,
    visitsThisMonth,
    recentVisits: recent.map((v) => ({
      date: fromDbDate(v.date),
      checkedInAt: v.checkedInAt.toISOString(),
    })),
    progress: progress.exercises,
  };
}

export async function attendance(userId: string, month?: string): Promise<PortalAttendance> {
  const member = await memberOf(userId);
  const m = month ?? (await gymToday()).slice(0, 7);
  const [visits, totalVisits] = await Promise.all([
    prisma.checkIn.findMany({
      where: { memberId: member.id, date: monthRange(m) },
      orderBy: { date: 'desc' },
      select: { date: true, checkedInAt: true },
    }),
    prisma.checkIn.count({ where: { memberId: member.id } }),
  ]);
  return {
    month: m,
    visits: visits.map((v) => ({
      date: fromDbDate(v.date),
      checkedInAt: v.checkedInAt.toISOString(),
    })),
    totalVisits,
  };
}

export async function progress(userId: string) {
  const member = await memberOf(userId);
  return { exercises: (await getProgress(member.id)).exercises };
}

const profileSelect = {
  firstName: true,
  lastName: true,
  phone: true,
  dateOfBirth: true,
  emergencyContact: true,
  user: { select: { email: true } },
} as const;

export async function profile(userId: string): Promise<PortalProfile> {
  const row = await prisma.member.findUnique({ where: { userId }, select: profileSelect });
  if (!row) throw new AppError(404, 'MEMBER_NOT_FOUND', 'No member profile for this account.');
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    email: row.user?.email ?? '',
    dateOfBirth: row.dateOfBirth ? fromDbDate(row.dateOfBirth) : null,
    emergencyContact: row.emergencyContact,
  };
}

/** A client may correct their own contact details; the email is their login and stays. */
export async function updateProfile(
  userId: string,
  input: PortalProfileInput,
): Promise<PortalProfile> {
  const { count } = await prisma.member.updateMany({
    where: { userId },
    data: { ...input, dateOfBirth: input.dateOfBirth ? toDbDate(input.dateOfBirth) : null },
  });
  if (count === 0)
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'No member profile for this account.');
  return profile(userId);
}
