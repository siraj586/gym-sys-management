import {
  addDays,
  EXPIRING_SOON_DAYS,
  MEMBER_STATUSES,
  memberStatus,
  subscriptionEndDate,
  subscriptionStatus,
  type MemberDetail,
  type MemberInput,
  type MemberListResponse,
  type MemberStatus,
  type MemberStatusCounts,
  type MemberSummary,
  type Subscription,
  type SubscriptionInput,
} from '@calisthenics/shared';
import { Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { gymToday } from '../../lib/settings.js';

export const PAGE_SIZE = 20;

const memberNotFound = () => new AppError(404, 'MEMBER_NOT_FOUND', 'This member does not exist.');

// ---------- Mapping database rows to API shapes ----------

const subscriptionSelect = {
  id: true,
  planId: true,
  planName: true,
  priceCents: true,
  startDate: true,
  endDate: true,
  cancelledAt: true,
} satisfies Prisma.SubscriptionSelect;

type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>;

function toSubscription(row: SubscriptionRow, today: string): Subscription {
  const period = {
    startDate: fromDbDate(row.startDate),
    endDate: fromDbDate(row.endDate),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
  return {
    id: row.id,
    planId: row.planId,
    planName: row.planName,
    priceCents: row.priceCents,
    ...period,
    status: subscriptionStatus(period, today),
  };
}

const summarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  userId: true,
  archivedAt: true,
  subscriptions: { select: subscriptionSelect, orderBy: { startDate: 'desc' } },
} satisfies Prisma.MemberSelect;

type SummaryRow = Prisma.MemberGetPayload<{ select: typeof summarySelect }>;

function toSummary(row: SummaryRow, today: string): MemberSummary {
  const subscriptions = row.subscriptions.map((s) => toSubscription(s, today));
  const live = subscriptions.filter((s) => !s.cancelledAt);
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    email: row.email,
    hasAccount: row.userId !== null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    status: memberStatus(subscriptions, today),
    // ISO dates compare correctly as strings.
    paidThrough: live.reduce<string | null>(
      (max, s) => (!max || s.endDate > max ? s.endDate : max),
      null,
    ),
  };
}

const detailSelect = {
  ...summarySelect,
  dateOfBirth: true,
  emergencyContact: true,
  healthNotes: true,
  coachNotes: true,
  createdAt: true,
} satisfies Prisma.MemberSelect;

type DetailRow = Prisma.MemberGetPayload<{ select: typeof detailSelect }>;

function toDetail(row: DetailRow, today: string): MemberDetail {
  return {
    ...toSummary(row, today),
    dateOfBirth: row.dateOfBirth ? fromDbDate(row.dateOfBirth) : null,
    emergencyContact: row.emergencyContact,
    healthNotes: row.healthNotes,
    coachNotes: row.coachNotes,
    createdAt: row.createdAt.toISOString(),
    subscriptions: row.subscriptions.map((s) => toSubscription(s, today)),
  };
}

function toMemberData(input: MemberInput) {
  return {
    ...input,
    dateOfBirth: input.dateOfBirth ? toDbDate(input.dateOfBirth) : null,
  };
}

// ---------- Queries ----------

/**
 * The database version of memberStatus() in @calisthenics/shared, so the list
 * can be filtered and paginated in SQL. Keep the two in step: the tests compare them.
 */
function statusWhere(status: MemberStatus, today: string): Prisma.MemberWhereInput {
  const day = toDbDate(today);
  const horizon = toDbDate(addDays(today, EXPIRING_SOON_DAYS));
  const live = { cancelledAt: null };
  const covering = { ...live, startDate: { lte: day }, endDate: { gte: day } };

  switch (status) {
    case 'ACTIVE':
      return {
        AND: [
          { subscriptions: { some: covering } },
          { subscriptions: { some: { ...live, endDate: { gt: horizon } } } },
        ],
      };
    case 'EXPIRING':
      return {
        AND: [
          { subscriptions: { some: covering } },
          { subscriptions: { none: { ...live, endDate: { gt: horizon } } } },
        ],
      };
    case 'UPCOMING':
      return {
        AND: [
          { subscriptions: { none: covering } },
          { subscriptions: { some: { ...live, startDate: { gt: day } } } },
        ],
      };
    case 'EXPIRED':
      return {
        AND: [
          { subscriptions: { some: live } },
          { subscriptions: { none: { ...live, endDate: { gte: day } } } },
        ],
      };
    case 'NONE':
      return { subscriptions: { none: live } };
  }
}

/** Every word must match the first name, last name, phone or email. */
function searchWhere(search: string | undefined): Prisma.MemberWhereInput {
  const words = (search ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
  return {
    AND: words.map((word) => ({
      OR: [
        { firstName: { contains: word, mode: 'insensitive' as const } },
        { lastName: { contains: word, mode: 'insensitive' as const } },
        { phone: { contains: word } },
        { email: { contains: word, mode: 'insensitive' as const } },
      ],
    })),
  };
}

export async function listMembers(query: {
  search?: string;
  status?: MemberStatus;
  archived: boolean;
  page: number;
}): Promise<MemberListResponse> {
  const today = await gymToday();
  const where: Prisma.MemberWhereInput = {
    AND: [
      { archivedAt: query.archived ? { not: null } : null },
      searchWhere(query.search),
      query.status ? statusWhere(query.status, today) : {},
    ],
  };

  const [rows, total] = await prisma.$transaction([
    prisma.member.findMany({
      where,
      select: summarySelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.member.count({ where }),
  ]);

  return {
    members: rows.map((row) => toSummary(row, today)),
    total,
    page: query.page,
    pageSize: PAGE_SIZE,
  };
}

/** How many current (not archived) members are in each status. */
export async function countByStatus(): Promise<MemberStatusCounts> {
  const today = await gymToday();
  const counts = await prisma.$transaction(
    MEMBER_STATUSES.map((status) =>
      prisma.member.count({ where: { archivedAt: null, ...statusWhere(status, today) } }),
    ),
  );
  return Object.fromEntries(
    MEMBER_STATUSES.map((status, i) => [status, counts[i] ?? 0]),
  ) as MemberStatusCounts;
}

export async function getMember(id: string): Promise<MemberDetail> {
  const [row, today] = await Promise.all([
    prisma.member.findUnique({ where: { id }, select: detailSelect }),
    gymToday(),
  ]);
  if (!row) throw memberNotFound();
  return toDetail(row, today);
}

export async function createMember(input: MemberInput): Promise<MemberDetail> {
  const row = await prisma.member.create({ data: toMemberData(input), select: detailSelect });
  return toDetail(row, await gymToday());
}

export async function updateMember(id: string, input: MemberInput): Promise<MemberDetail> {
  const { count } = await prisma.member.updateMany({ where: { id }, data: toMemberData(input) });
  if (count === 0) throw memberNotFound();
  return getMember(id);
}

/** Members are archived, never deleted: their payments and attendance stay on record. */
export async function setArchived(id: string, archived: boolean): Promise<MemberDetail> {
  const { count } = await prisma.member.updateMany({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) throw memberNotFound();
  return getMember(id);
}

// ---------- Subscriptions ----------

/**
 * Sells one period of a plan to a member. The plan's name and price are copied
 * onto the subscription, and two live subscriptions of a member never overlap.
 */
export async function createSubscription(
  memberId: string,
  input: SubscriptionInput,
): Promise<Subscription> {
  const today = await gymToday();

  const row = await prisma.$transaction(async (tx) => {
    // Locking the member row makes two simultaneous sales for the same member
    // run one after the other, so the overlap check below cannot be raced.
    const [member] = await tx.$queryRaw<{ archivedAt: Date | null }[]>`
      SELECT "archivedAt" FROM "Member" WHERE id = ${memberId} FOR UPDATE`;
    if (!member) throw memberNotFound();
    if (member.archivedAt) {
      throw new AppError(
        409,
        'MEMBER_ARCHIVED',
        'Restore this member before adding a subscription.',
      );
    }

    const plan = await tx.plan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new AppError(400, 'PLAN_NOT_FOUND', 'This plan does not exist.');
    if (!plan.isActive) {
      throw new AppError(409, 'PLAN_INACTIVE', 'This plan is no longer offered.');
    }

    const endDate = subscriptionEndDate(input.startDate, plan.durationMonths);
    const overlapping = await tx.subscription.findFirst({
      where: {
        memberId,
        cancelledAt: null,
        startDate: { lte: toDbDate(endDate) },
        endDate: { gte: toDbDate(input.startDate) },
      },
      select: { startDate: true, endDate: true },
    });
    if (overlapping) {
      throw new AppError(
        409,
        'SUBSCRIPTION_OVERLAP',
        'This period overlaps a subscription the member already has.',
        { startDate: fromDbDate(overlapping.startDate), endDate: fromDbDate(overlapping.endDate) },
      );
    }

    return tx.subscription.create({
      data: {
        memberId,
        planId: plan.id,
        planName: plan.name,
        priceCents: plan.priceCents,
        startDate: toDbDate(input.startDate),
        endDate: toDbDate(endDate),
      },
      select: subscriptionSelect,
    });
  });

  return toSubscription(row, today);
}

/** Cancelling keeps the row (and later its payments) for the record. */
export async function cancelSubscription(id: string): Promise<Subscription> {
  const { count } = await prisma.subscription.updateMany({
    where: { id, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
  const row = await prisma.subscription.findUnique({ where: { id }, select: subscriptionSelect });
  if (!row) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'This subscription does not exist.');
  if (count === 0) {
    throw new AppError(
      409,
      'SUBSCRIPTION_ALREADY_CANCELLED',
      'This subscription is already cancelled.',
    );
  }
  return toSubscription(row, await gymToday());
}
