import type { CheckoutOptions, CheckoutStarted, CheckoutState } from '@calisthenics/shared';
import { env } from '../../config/env.js';
import { fromDbDate } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { getSettings, gymToday } from '../../lib/settings.js';
import { renewInTransaction } from '../members/members.service.js';
import { paymentProvider } from './providers/index.js';
import type { ProviderOutcome, RawNotification } from './providers/types.js';

/** An attempt nobody finished within this time is marked expired. */
const EXPIRE_AFTER_MS = 60 * 60 * 1000;

const notFound = () => new AppError(404, 'CHECKOUT_NOT_FOUND', 'This payment does not exist.');

async function memberOf(userId: string) {
  const member = await prisma.member.findUnique({
    where: { userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      archivedAt: true,
      subscriptions: {
        where: { cancelledAt: null },
        orderBy: { endDate: 'desc' },
        take: 1,
        select: { planId: true },
      },
    },
  });
  if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'No member profile for this account.');
  return member;
}

/** What the portal needs to show the "pay online" button. */
export async function options(userId: string): Promise<CheckoutOptions> {
  const provider = paymentProvider();
  const member = await memberOf(userId);
  const plans = provider
    ? await prisma.plan.findMany({
        where: { isActive: true },
        orderBy: [{ priceCents: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          priceCents: true,
          durationMonths: true,
          description: true,
          isActive: true,
        },
      })
    : [];
  const usual = member.subscriptions[0]?.planId;
  return {
    enabled: provider !== null && plans.length > 0 && member.archivedAt === null,
    provider: provider?.name ?? null,
    plans,
    suggestedPlanId: plans.some((p) => p.id === usual) ? usual! : (plans[0]?.id ?? null),
  };
}

/**
 * Starts paying for the next month of a plan: fixes the price now, then asks
 * the provider for its payment page.
 */
export async function start(userId: string, planId: string): Promise<CheckoutStarted> {
  const provider = paymentProvider();
  if (!provider) {
    throw new AppError(409, 'ONLINE_PAYMENT_OFF', 'Online payment is not available.');
  }
  const member = await memberOf(userId);
  if (member.archivedAt) {
    throw new AppError(409, 'MEMBER_ARCHIVED', 'Contact the gym to reactivate your membership.');
  }
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) {
    throw new AppError(409, 'PLAN_INACTIVE', 'This plan is no longer offered.');
  }
  const settings = await getSettings();

  // Old unfinished attempts of this member are closed first.
  await prisma.onlineCheckout.updateMany({
    where: {
      memberId: member.id,
      status: 'PENDING',
      createdAt: { lt: new Date(Date.now() - EXPIRE_AFTER_MS) },
    },
    data: { status: 'EXPIRED', completedAt: new Date() },
  });

  const checkout = await prisma.onlineCheckout.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      planName: plan.name,
      amountCents: plan.priceCents,
      currency: settings.currency,
      provider: provider.name,
    },
  });

  const base = env.PUBLIC_URL ?? env.CLIENT_ORIGIN;
  try {
    const session = await provider.createSession({
      checkoutId: checkout.id,
      amountCents: checkout.amountCents,
      currency: checkout.currency,
      description: `${plan.name} — ${settings.businessName}`,
      customer: {
        name: `${member.firstName} ${member.lastName}`,
        phone: member.phone,
        email: member.email,
      },
      returnUrl: `${base}/portal/checkout/${checkout.id}`,
      notifyUrl: `${base}/api/checkout/notify/${provider.name}`,
    });
    await prisma.onlineCheckout.update({
      where: { id: checkout.id },
      data: { providerRef: session.providerRef },
    });
    return { checkoutId: checkout.id, redirectUrl: session.redirectUrl };
  } catch (err) {
    await prisma.onlineCheckout.update({
      where: { id: checkout.id },
      data: {
        status: 'FAILED',
        failureReason: err instanceof Error ? err.message.slice(0, 300) : 'Provider error',
        completedAt: new Date(),
      },
    });
    if (err instanceof AppError) throw err;
    console.error(err);
    throw new AppError(502, 'PROVIDER_ERROR', 'The payment page could not be opened. Try again.');
  }
}

/** A notification arrived at /api/checkout/notify/<providerName>. */
export async function handleNotification(
  providerName: string,
  raw: RawNotification,
): Promise<void> {
  const provider = paymentProvider();
  if (!provider || provider.name !== providerName) throw notFound();
  const outcome = await provider.verifyNotification(raw);
  if (!outcome) {
    throw new AppError(401, 'INVALID_NOTIFICATION', 'This notification could not be verified.');
  }
  await complete(outcome);
}

/**
 * Applies the provider's verdict, exactly once per checkout. Paid: the next
 * month and its payment are created at the price fixed when the checkout
 * started. A repeated notification changes nothing.
 */
export async function complete(outcome: ProviderOutcome): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // The row lock makes simultaneous notifications for one checkout run one
    // after the other; the second sees it is already done.
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "OnlineCheckout" WHERE "providerRef" = ${outcome.providerRef} FOR UPDATE`;
    if (!locked) throw notFound();
    const checkout = await tx.onlineCheckout.findUniqueOrThrow({
      where: { id: locked.id },
      include: { member: { select: { userId: true } } },
    });
    // PAID and FAILED are final. EXPIRED may still turn PAID: the money was taken.
    if (checkout.status === 'PAID' || checkout.status === 'FAILED') return;
    if (checkout.status === 'EXPIRED' && outcome.status !== 'PAID') return;

    if (outcome.status === 'FAILED') {
      await tx.onlineCheckout.update({
        where: { id: checkout.id },
        data: { status: 'FAILED', failureReason: outcome.reason ?? null, completedAt: new Date() },
      });
      return;
    }

    const amountMatches =
      (outcome.amountCents === undefined || outcome.amountCents === checkout.amountCents) &&
      (outcome.currency === undefined || outcome.currency === checkout.currency);
    if (!amountMatches) {
      // Never sell a month for a different amount; the coach sorts it out by hand.
      await tx.onlineCheckout.update({
        where: { id: checkout.id },
        data: {
          status: 'FAILED',
          failureReason: `Amount mismatch: provider reported ${outcome.amountCents} ${outcome.currency}`,
          completedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'checkout.amountMismatch',
          entity: 'OnlineCheckout',
          entityId: checkout.id,
          meta: { expected: checkout.amountCents, reported: outcome.amountCents ?? null },
        },
      });
      return;
    }

    const recordedById = checkout.member.userId;
    if (!recordedById) throw new Error(`Checkout ${checkout.id}: member has no account`);
    const subscriptionId = await renewInTransaction(
      tx,
      checkout.memberId,
      {
        planId: checkout.planId,
        amountCents: checkout.amountCents,
        method: 'WHISH_MONEY',
        paidAt: await gymToday(),
        reference: outcome.providerRef,
        note: 'Paid online',
      },
      recordedById,
      { planName: checkout.planName, priceCents: checkout.amountCents },
    );
    await tx.onlineCheckout.update({
      where: { id: checkout.id },
      data: { status: 'PAID', subscriptionId, completedAt: new Date() },
    });
  });
}

/**
 * The client's view of one checkout. Still pending: ask the provider, in case
 * its notification has not arrived yet.
 */
export async function state(userId: string, checkoutId: string): Promise<CheckoutState> {
  const member = await memberOf(userId);
  let checkout = await prisma.onlineCheckout.findFirst({
    where: { id: checkoutId, memberId: member.id },
  });
  if (!checkout) throw notFound();

  const provider = paymentProvider();
  if (
    checkout.status === 'PENDING' &&
    checkout.providerRef &&
    provider?.name === checkout.provider
  ) {
    const outcome = await provider.fetchStatus(checkout.providerRef);
    if (outcome.status !== 'PENDING') {
      await complete(outcome);
      checkout = await prisma.onlineCheckout.findUniqueOrThrow({ where: { id: checkout.id } });
    }
  }

  const sub = checkout.subscriptionId
    ? await prisma.subscription.findUnique({
        where: { id: checkout.subscriptionId },
        select: { startDate: true, endDate: true },
      })
    : null;
  return {
    id: checkout.id,
    status: checkout.status,
    planName: checkout.planName,
    amountCents: checkout.amountCents,
    currency: checkout.currency,
    period: sub ? { startDate: fromDbDate(sub.startDate), endDate: fromDbDate(sub.endDate) } : null,
  };
}
