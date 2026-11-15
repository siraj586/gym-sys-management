import { z } from 'zod';
import { isIsoDate } from './dates.js';

// Validation messages are translation keys, as in auth.ts.

/** Same values as the PaymentMethod enum in the Prisma schema. */
export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Derived from non-voided payments against the subscription price; never stored. */
export const PAYMENT_STATUSES = ['PAID', 'PARTIAL', 'UNPAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function paymentStatus(priceCents: number, paidCents: number): PaymentStatus {
  if (paidCents >= priceCents) return 'PAID';
  return paidCents > 0 ? 'PARTIAL' : 'UNPAID';
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullish()
    .transform((value) => (value ? value : null));

export const paymentInputSchema = z.object({
  amountCents: z
    .number({ error: 'validation.amount' })
    .int('validation.amount')
    .min(1, 'validation.amount')
    .max(10_000_000, 'validation.amount'),
  method: z.enum(PAYMENT_METHODS, { error: 'validation.required' }),
  paidAt: z.string().trim().refine(isIsoDate, 'validation.date'),
  reference: optionalText(100),
  note: optionalText(500),
});
export type PaymentFormInput = z.input<typeof paymentInputSchema>;
export type PaymentInput = z.output<typeof paymentInputSchema>;

/** "Renew and record payment": the next month of a plan, paid now. */
export const renewalInputSchema = paymentInputSchema.extend({
  planId: z.string().min(1, 'validation.required'),
});
export type RenewalFormInput = z.input<typeof renewalInputSchema>;
export type RenewalInput = z.output<typeof renewalInputSchema>;

export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(1, 'validation.required').max(200, 'validation.tooLong'),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

/** "2026-11" */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'validation.month');

// ---------- Responses ----------

export interface Payment {
  id: string;
  subscriptionId: string;
  amountCents: number;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  note: string | null;
  recordedBy: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

/** A payment in the income list, with who paid and for what. */
export interface PaymentListItem extends Payment {
  member: { id: string; firstName: string; lastName: string };
  planName: string;
  /** The month the payment is for. */
  period: { startDate: string; endDate: string };
}

export interface PaymentListResponse {
  month: string;
  payments: PaymentListItem[];
  /** Non-voided payments only. */
  totalCents: number;
  byMethod: Record<PaymentMethod, number>;
}

/** A live subscription that is not fully paid. */
export interface UnpaidSubscription {
  subscriptionId: string;
  member: { id: string; firstName: string; lastName: string; phone: string };
  planName: string;
  startDate: string;
  endDate: string;
  priceCents: number;
  paidCents: number;
  balanceCents: number;
}

export interface PaymentSummary {
  month: string;
  monthIncomeCents: number;
  unpaidCount: number;
  unpaidCents: number;
}
