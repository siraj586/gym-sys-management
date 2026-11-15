import { z } from 'zod';
import { addDays, addMonths, isIsoDate } from './dates.js';

// Validation messages are translation keys, as in auth.ts.

/** A membership counts as "expiring" when its paid time ends within this many days. */
export const EXPIRING_SOON_DAYS = 7;

/**
 * The last valid day of a subscription that starts on `startDate`:
 * start 3 Oct, 1 month -> end 3 Nov (see the Subscription model).
 */
export function subscriptionEndDate(startDate: string, durationMonths: number): string {
  return addMonths(startDate, durationMonths);
}

// ---------- Status ----------

export const SUBSCRIPTION_STATUSES = [
  'UPCOMING',
  'ACTIVE',
  'EXPIRING',
  'EXPIRED',
  'CANCELLED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Where a member stands today, judged from all their subscriptions together. */
export const MEMBER_STATUSES = ['ACTIVE', 'EXPIRING', 'UPCOMING', 'EXPIRED', 'NONE'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

interface Period {
  startDate: string;
  endDate: string;
  cancelledAt: string | null;
}

export function subscriptionStatus(sub: Period, today: string): SubscriptionStatus {
  if (sub.cancelledAt) return 'CANCELLED';
  if (sub.startDate > today) return 'UPCOMING';
  if (sub.endDate < today) return 'EXPIRED';
  return sub.endDate <= addDays(today, EXPIRING_SOON_DAYS) ? 'EXPIRING' : 'ACTIVE';
}

/**
 * ACTIVE / EXPIRING: a subscription covers today. It is EXPIRING when no paid
 * day (in this or a later subscription) lies beyond the expiring window.
 * UPCOMING: nothing covers today but a later subscription is booked.
 * EXPIRED: every subscription has ended. NONE: never subscribed (or all cancelled).
 *
 * The server's list filter (members.service.ts) encodes the same rules as a
 * database query; the tests check that both agree.
 */
export function memberStatus(subs: Period[], today: string): MemberStatus {
  const live = subs.filter((s) => !s.cancelledAt);
  if (live.length === 0) return 'NONE';
  const covering = live.some((s) => s.startDate <= today && s.endDate >= today);
  if (covering) {
    const horizon = addDays(today, EXPIRING_SOON_DAYS);
    return live.some((s) => s.endDate > horizon) ? 'ACTIVE' : 'EXPIRING';
  }
  return live.some((s) => s.startDate > today) ? 'UPCOMING' : 'EXPIRED';
}

// ---------- Inputs ----------

const isoDate = z.string().trim().refine(isIsoDate, 'validation.date');

const name = z.string().trim().min(1, 'validation.required').max(50, 'validation.tooLong');

/** Optional text: an empty field becomes null, so it clears the stored value. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullish()
    .transform((value) => (value ? value : null));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((value) => (value ? value : null))
  .pipe(z.email('validation.email').nullable());

const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .pipe(isoDate.nullable());

export const memberInputSchema = z.object({
  firstName: name,
  lastName: name,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/, 'validation.phone'),
  email: optionalEmail,
  dateOfBirth: optionalDate,
  emergencyContact: optionalText(200),
  healthNotes: optionalText(2000),
  coachNotes: optionalText(2000),
});
/** What a form sends (before the schema trims and fills in nulls). */
export type MemberFormInput = z.input<typeof memberInputSchema>;
export type MemberInput = z.output<typeof memberInputSchema>;

export const memberListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(MEMBER_STATUSES).optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type MemberListQuery = z.input<typeof memberListQuerySchema>;

export const planInputSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(80, 'validation.tooLong'),
  // Whole cents avoid rounding errors; 10,000,000 cents is a safe upper bound.
  priceCents: z
    .number({ error: 'validation.price' })
    .int('validation.price')
    .min(0, 'validation.price')
    .max(10_000_000, 'validation.price'),
  durationMonths: z
    .number({ error: 'validation.duration' })
    .int('validation.duration')
    .min(1, 'validation.duration')
    .max(24, 'validation.duration'),
  description: optionalText(500),
  isActive: z.boolean().default(true),
});
export type PlanFormInput = z.input<typeof planInputSchema>;
export type PlanInput = z.output<typeof planInputSchema>;

export const subscriptionInputSchema = z.object({
  planId: z.string().min(1, 'validation.required'),
  startDate: isoDate,
});
export type SubscriptionInput = z.infer<typeof subscriptionInputSchema>;

// ---------- Responses ----------

export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  durationMonths: number;
  description: string | null;
  isActive: boolean;
}

export interface Subscription {
  id: string;
  planId: string;
  planName: string;
  priceCents: number;
  startDate: string;
  endDate: string;
  cancelledAt: string | null;
  status: SubscriptionStatus;
}

export interface MemberSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  hasAccount: boolean;
  archivedAt: string | null;
  status: MemberStatus;
  /** Last paid day across all live subscriptions, or null when there are none. */
  paidThrough: string | null;
}

export interface MemberDetail extends MemberSummary {
  dateOfBirth: string | null;
  emergencyContact: string | null;
  healthNotes: string | null;
  coachNotes: string | null;
  createdAt: string;
  subscriptions: Subscription[];
}

export interface MemberListResponse {
  members: MemberSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type MemberStatusCounts = Record<MemberStatus, number>;

export interface GymSettings {
  businessName: string;
  timezone: string;
  currency: string;
  /** Today in the gym's timezone, so the app and the server agree on the date. */
  today: string;
}
