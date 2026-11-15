import {
  addMonths,
  PAYMENT_METHODS,
  type Payment,
  type PaymentInput,
  type PaymentListResponse,
  type PaymentMethod,
  type PaymentSummary,
  type UnpaidSubscription,
} from '@calisthenics/shared';
import { Prisma } from '@prisma/client';
import { fromDbDate, toDbDate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { gymToday } from '../../lib/settings.js';

export const paymentSelect = {
  id: true,
  subscriptionId: true,
  amountCents: true,
  method: true,
  paidAt: true,
  reference: true,
  note: true,
  createdAt: true,
  voidedAt: true,
  voidReason: true,
  recordedBy: { select: { email: true } },
} satisfies Prisma.PaymentSelect;

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    amountCents: row.amountCents,
    method: row.method,
    paidAt: fromDbDate(row.paidAt),
    reference: row.reference,
    note: row.note,
    recordedBy: row.recordedBy.email,
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
  };
}

/** Sum of the payments that count (voided ones never do). */
export function paidCents(payments: { amountCents: number; voidedAt: Date | null }[]): number {
  return payments.reduce((sum, p) => (p.voidedAt ? sum : sum + p.amountCents), 0);
}

const subscriptionNotFound = () =>
  new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'This subscription does not exist.');

/**
 * Records money received for a subscription. A payment can never take the
 * total above the price, and never be dated after today.
 */
export async function recordPayment(
  subscriptionId: string,
  input: PaymentInput,
  recordedById: string,
): Promise<Payment> {
  const today = await gymToday();
  if (input.paidAt > today) {
    throw new AppError(400, 'PAYMENT_IN_FUTURE', 'A payment cannot be dated after today.');
  }

  return prisma.$transaction(async (tx) => {
    // Lock the subscription so two payments recorded at once cannot both
    // pass the balance check and overpay it together.
    const [sub] = await tx.$queryRaw<{ priceCents: number; cancelledAt: Date | null }[]>`
      SELECT "priceCents", "cancelledAt" FROM "Subscription" WHERE id = ${subscriptionId} FOR UPDATE`;
    if (!sub) throw subscriptionNotFound();
    if (sub.cancelledAt) {
      throw new AppError(409, 'SUBSCRIPTION_CANCELLED', 'This subscription is cancelled.');
    }

    const existing = await tx.payment.findMany({
      where: { subscriptionId, voidedAt: null },
      select: { amountCents: true, voidedAt: true },
    });
    const balance = sub.priceCents - paidCents(existing);
    if (input.amountCents > balance) {
      throw new AppError(
        409,
        'PAYMENT_EXCEEDS_BALANCE',
        'This amount is more than what is still owed.',
        { balanceCents: balance },
      );
    }

    const row = await tx.payment.create({
      data: { ...input, subscriptionId, paidAt: toDbDate(input.paidAt), recordedById },
      select: paymentSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId: recordedById,
        action: 'payment.record',
        entity: 'Payment',
        entityId: row.id,
        meta: { subscriptionId, amountCents: input.amountCents, method: input.method },
      },
    });
    return toPayment(row);
  });
}

/** Payments are voided, never deleted, so the income history always adds up. */
export async function voidPayment(id: string, reason: string, actorId: string): Promise<Payment> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.payment.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidReason: reason },
    });
    const row = await tx.payment.findUnique({ where: { id }, select: paymentSelect });
    if (!row) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'This payment does not exist.');
    if (count === 0) {
      throw new AppError(409, 'PAYMENT_ALREADY_VOIDED', 'This payment is already voided.');
    }
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'payment.void',
        entity: 'Payment',
        entityId: id,
        meta: { reason, amountCents: row.amountCents },
      },
    });
    return toPayment(row);
  });
}

/** First day of `month` and of the month after, for a paidAt range. */
function monthRange(month: string) {
  const first = `${month}-01`;
  return { gte: toDbDate(first), lt: toDbDate(addMonths(first, 1)) };
}

/** Every payment dated in `month` (voided ones included, marked), newest first. */
export async function listPayments(month: string): Promise<PaymentListResponse> {
  const rows = await prisma.payment.findMany({
    where: { paidAt: monthRange(month) },
    select: {
      ...paymentSelect,
      subscription: {
        select: {
          planName: true,
          startDate: true,
          endDate: true,
          member: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
  });

  const byMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<
    PaymentMethod,
    number
  >;
  for (const row of rows) {
    if (!row.voidedAt) byMethod[row.method] += row.amountCents;
  }

  return {
    month,
    payments: rows.map(({ subscription, ...row }) => ({
      ...toPayment(row),
      member: subscription.member,
      planName: subscription.planName,
      period: {
        startDate: fromDbDate(subscription.startDate),
        endDate: fromDbDate(subscription.endDate),
      },
    })),
    totalCents: paidCents(rows),
    byMethod,
  };
}

/**
 * Live subscriptions with money still owed, oldest first: the first rows are
 * the debts that have waited longest. Archived members are included, because
 * archiving someone does not cancel what they owe.
 */
export async function listUnpaid(): Promise<UnpaidSubscription[]> {
  const rows = await prisma.$queryRaw<
    {
      subscriptionId: string;
      memberId: string;
      firstName: string;
      lastName: string;
      phone: string;
      planName: string;
      startDate: Date;
      endDate: Date;
      priceCents: number;
      paidCents: bigint;
    }[]
  >`
    SELECT s.id AS "subscriptionId", m.id AS "memberId", m."firstName", m."lastName", m.phone,
           s."planName", s."startDate", s."endDate", s."priceCents",
           COALESCE(SUM(p."amountCents") FILTER (WHERE p."voidedAt" IS NULL), 0) AS "paidCents"
    FROM "Subscription" s
    JOIN "Member" m ON m.id = s."memberId"
    LEFT JOIN "Payment" p ON p."subscriptionId" = s.id
    WHERE s."cancelledAt" IS NULL
    GROUP BY s.id, m.id
    HAVING COALESCE(SUM(p."amountCents") FILTER (WHERE p."voidedAt" IS NULL), 0) < s."priceCents"
    ORDER BY s."startDate", m."firstName", s.id`;

  return rows.map((r) => {
    const paid = Number(r.paidCents);
    return {
      subscriptionId: r.subscriptionId,
      member: { id: r.memberId, firstName: r.firstName, lastName: r.lastName, phone: r.phone },
      planName: r.planName,
      startDate: fromDbDate(r.startDate),
      endDate: fromDbDate(r.endDate),
      priceCents: r.priceCents,
      paidCents: paid,
      balanceCents: r.priceCents - paid,
    };
  });
}

/** Figures for the dashboard: this month's income and what is still owed. */
export async function summary(): Promise<PaymentSummary> {
  const month = (await gymToday()).slice(0, 7);
  const [income, unpaid] = await Promise.all([
    prisma.payment.aggregate({
      where: { paidAt: monthRange(month), voidedAt: null },
      _sum: { amountCents: true },
    }),
    listUnpaid(),
  ]);
  return {
    month,
    monthIncomeCents: income._sum.amountCents ?? 0,
    unpaidCount: unpaid.length,
    unpaidCents: unpaid.reduce((sum, u) => sum + u.balanceCents, 0),
  };
}

/**
 * Corrects a payment: amount, method, date, reference, note. The month can
 * still never be paid more than its price, and the date is never after today.
 */
export async function updatePayment(
  id: string,
  input: PaymentInput,
  actorId: string,
): Promise<Payment> {
  const today = await gymToday();
  if (input.paidAt > today) {
    throw new AppError(400, 'PAYMENT_IN_FUTURE', 'A payment cannot be dated after today.');
  }
  return prisma.$transaction(async (tx) => {
    const current = await tx.payment.findUnique({
      where: { id },
      select: { subscriptionId: true, amountCents: true, method: true, paidAt: true },
    });
    if (!current) throw paymentNotFound();
    // Same lock as recording a payment: the balance check cannot be raced.
    const [sub] = await tx.$queryRaw<{ priceCents: number }[]>`
      SELECT "priceCents" FROM "Subscription" WHERE id = ${current.subscriptionId} FOR UPDATE`;
    const others = await tx.payment.findMany({
      where: { subscriptionId: current.subscriptionId, voidedAt: null, id: { not: id } },
      select: { amountCents: true, voidedAt: true },
    });
    const balance = sub!.priceCents - paidCents(others);
    if (input.amountCents > balance) {
      throw new AppError(
        409,
        'PAYMENT_EXCEEDS_BALANCE',
        'This amount is more than what is owed for this month.',
        { balanceCents: balance },
      );
    }
    const row = await tx.payment.update({
      where: { id },
      data: { ...input, paidAt: toDbDate(input.paidAt) },
      select: paymentSelect,
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'payment.edit',
        entity: 'Payment',
        entityId: id,
        meta: {
          before: {
            amountCents: current.amountCents,
            method: current.method,
            paidAt: fromDbDate(current.paidAt),
          },
          after: { amountCents: input.amountCents, method: input.method, paidAt: input.paidAt },
        },
      },
    });
    return toPayment(row);
  });
}

/**
 * Deletes a payment for good, e.g. one saved twice: it leaves the income
 * figures. With `withMonth`, the month it paid for goes too, when no other
 * payment is left on it (a renewal saved twice created a second month).
 */
export async function deletePayment(
  id: string,
  actorId: string,
  withMonth: boolean,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id },
      select: { subscriptionId: true, amountCents: true, method: true, paidAt: true },
    });
    if (!payment) throw paymentNotFound();
    await tx.payment.delete({ where: { id } });

    let monthDeleted = false;
    if (withMonth) {
      const left = await tx.payment.count({ where: { subscriptionId: payment.subscriptionId } });
      if (left === 0) {
        await tx.subscription.delete({ where: { id: payment.subscriptionId } });
        monthDeleted = true;
      }
    }
    await tx.auditLog.create({
      data: {
        actorId,
        action: 'payment.delete',
        entity: 'Payment',
        entityId: id,
        meta: {
          subscriptionId: payment.subscriptionId,
          amountCents: payment.amountCents,
          method: payment.method,
          paidAt: fromDbDate(payment.paidAt),
          monthDeleted,
        },
      },
    });
  });
}

const paymentNotFound = () =>
  new AppError(404, 'PAYMENT_NOT_FOUND', 'This payment does not exist.');
