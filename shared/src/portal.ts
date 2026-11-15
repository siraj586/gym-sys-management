import { z } from 'zod';
import { isIsoDate } from './dates.js';
import type { MemberStatus, SubscriptionStatus } from './membership.js';
import type { PaymentMethod } from './payments.js';
import type { ProgramDay } from './programs.js';
import type { ExerciseProgress } from './progress.js';

// What a client sees about themselves. Nothing here names another member or
// carries the coach-only notes.

export interface PortalSubscription {
  planName: string;
  priceCents: number;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  /** Days from today to the end date (0 on the last day; negative once ended). */
  daysLeft: number;
  totalDays: number;
  lastPayment: { amountCents: number; method: PaymentMethod; paidAt: string } | null;
}

export interface PortalProgram {
  name: string;
  level: string | null;
  goal: string | null;
  assignedAt: string;
  days: ProgramDay[];
}

export interface PortalVisit {
  date: string;
  checkedInAt: string;
}

export interface PortalHome {
  firstName: string;
  status: MemberStatus;
  /** The month covering today; else the next one booked; else the last one. */
  subscription: PortalSubscription | null;
  program: PortalProgram | null;
  visitsThisMonth: number;
  recentVisits: PortalVisit[];
  progress: ExerciseProgress[];
}

export interface PortalAttendance {
  month: string;
  visits: PortalVisit[];
  totalVisits: number;
}

export interface PortalProfile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth: string | null;
  emergencyContact: string | null;
}

const name = z.string().trim().min(1, 'validation.required').max(50, 'validation.tooLong');

export const portalProfileInputSchema = z.object({
  firstName: name,
  lastName: name,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/, 'validation.phone'),
  dateOfBirth: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(z.string().refine(isIsoDate, 'validation.date').nullable()),
  emergencyContact: z
    .string()
    .trim()
    .max(200, 'validation.tooLong')
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type PortalProfileInput = z.output<typeof portalProfileInputSchema>;
