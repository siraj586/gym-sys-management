import {
  addMonths,
  daysBetween,
  type DashboardData,
  type MonthRevenue,
  type NotPaid,
  type RenewalDue,
} from '@calisthenics/shared';
import { fromDbDate, toDbDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { gymToday } from '../../lib/settings.js';
import { statusWhere } from '../members/members.service.js';
import { listUnpaid } from '../payments/payments.service.js';

/** How far back an ended month still counts as "due for renewal". */
const RENEWAL_LOOKBACK_DAYS = 30;

const liveLatest = {
  where: { cancelledAt: null },
  orderBy: { endDate: 'desc' as const },
  take: 1,
  select: { startDate: true, endDate: true, planId: true, priceCents: true },
};

/** Expired first (most recent first), then those ending soonest. */
async function renewalsDue(today: string): Promise<RenewalDue[]> {
  const members = await prisma.member.findMany({
    where: {
      archivedAt: null,
      OR: [statusWhere('EXPIRING', today), statusWhere('EXPIRED', today)],
    },
    select: { id: true, firstName: true, lastName: true, subscriptions: liveLatest },
  });

  return members
    .flatMap((m) => {
      const sub = m.subscriptions[0];
      if (!sub) return [];
      const endDate = fromDbDate(sub.endDate);
      const daysLeft = daysBetween(today, endDate);
      if (daysLeft < -RENEWAL_LOOKBACK_DAYS) return [];
      return [
        {
          memberId: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          startDate: fromDbDate(sub.startDate),
          endDate,
          daysLeft,
          planId: sub.planId,
        },
      ];
    })
    .sort((a, b) => {
      const aExpired = a.daysLeft < 0;
      const bExpired = b.daysLeft < 0;
      if (aExpired !== bExpired) return aExpired ? -1 : 1;
      return aExpired ? b.daysLeft - a.daysLeft : a.daysLeft - b.daysLeft;
    });
}

/**
 * Who owes money: members whose month ran out or who never paid one (they owe
 * their usual month), and months that are only partly paid (they owe the rest).
 */
export async function notPaid(today: string): Promise<NotPaid[]> {
  const [lapsed, partial, cheapest] = await Promise.all([
    prisma.member.findMany({
      where: {
        archivedAt: null,
        OR: [statusWhere('EXPIRED', today), statusWhere('NONE', today)],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        subscriptions: {
          ...liveLatest,
          select: { ...liveLatest.select, plan: { select: { priceCents: true, isActive: true } } },
        },
      },
    }),
    listUnpaid(),
    prisma.plan.findFirst({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
      select: { priceCents: true },
    }),
  ]);

  const owing: NotPaid[] = lapsed.map((m) => {
    const sub = m.subscriptions[0];
    // Their usual plan at today's price; else the cheapest plan on sale.
    const price = sub?.plan?.isActive ? sub.plan.priceCents : (cheapest?.priceCents ?? null);
    return {
      memberId: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      reason: sub ? 'EXPIRED' : 'NEVER',
      endDate: sub ? fromDbDate(sub.endDate) : null,
      amountCents: price,
      subscriptionId: null,
    };
  });
  for (const u of partial) {
    owing.push({
      memberId: u.member.id,
      firstName: u.member.firstName,
      lastName: u.member.lastName,
      reason: 'BALANCE',
      endDate: u.endDate,
      amountCents: u.balanceCents,
      subscriptionId: u.subscriptionId,
    });
  }

  const rank = { BALANCE: 0, EXPIRED: 1, NEVER: 2 };
  return owing.sort(
    (a, b) =>
      rank[a.reason] - rank[b.reason] ||
      (b.endDate ?? '').localeCompare(a.endDate ?? '') ||
      a.firstName.localeCompare(b.firstName),
  );
}

/** Money received per month for the last `months` months, oldest first. */
export async function monthlyRevenue(today: string, months = 6): Promise<MonthRevenue[]> {
  const firstMonth = addMonths(`${today.slice(0, 7)}-01`, -(months - 1));
  const rows = await prisma.$queryRaw<{ month: string; cents: bigint }[]>`
    SELECT to_char(date_trunc('month', "paidAt"), 'YYYY-MM') AS month,
           SUM("amountCents")::bigint AS cents
    FROM "Payment"
    WHERE "voidedAt" IS NULL AND "paidAt" >= ${toDbDate(firstMonth)}::date
    GROUP BY 1`;
  const byMonth = new Map(rows.map((r) => [r.month, Number(r.cents)]));
  return Array.from({ length: months }, (_, i) => {
    const month = addMonths(firstMonth, i).slice(0, 7);
    return { month, cents: byMonth.get(month) ?? 0 };
  });
}

export async function dashboard(): Promise<DashboardData> {
  const today = await gymToday();
  const monthStart = toDbDate(`${today.slice(0, 7)}-01`);
  const nextMonth = toDbDate(addMonths(`${today.slice(0, 7)}-01`, 1));
  const covering = (status: 'ACTIVE' | 'EXPIRING') =>
    prisma.member.count({ where: { archivedAt: null, ...statusWhere(status, today) } });

  const [
    totalMembers,
    joinedThisMonth,
    active,
    endingSoon,
    expired,
    income,
    checkInsToday,
    renewals,
    owing,
    revenue,
  ] = await Promise.all([
    prisma.member.count({ where: { archivedAt: null } }),
    prisma.member.count({ where: { archivedAt: null, createdAt: { gte: monthStart } } }),
    covering('ACTIVE'),
    covering('EXPIRING'),
    prisma.member.count({ where: { archivedAt: null, ...statusWhere('EXPIRED', today) } }),
    prisma.payment.aggregate({
      where: { voidedAt: null, paidAt: { gte: monthStart, lt: nextMonth } },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.checkIn.count({ where: { date: toDbDate(today) } }),
    renewalsDue(today),
    notPaid(today),
    monthlyRevenue(today),
  ]);

  return {
    today,
    totalMembers,
    joinedThisMonth,
    activeSubscriptions: active + endingSoon,
    endingSoon,
    expired,
    collectedThisMonthCents: income._sum.amountCents ?? 0,
    paymentsThisMonth: income._count,
    checkInsToday,
    renewals,
    notPaid: owing,
    notPaidCents: owing.reduce((sum, o) => sum + (o.amountCents ?? 0), 0),
    revenue,
  };
}
