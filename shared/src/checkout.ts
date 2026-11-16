import { z } from 'zod';
import type { Plan } from './membership.js';

// Online payment by a client (Whish). The flow:
// 1. the portal asks for the options and starts a checkout for a plan;
// 2. the browser goes to the provider's payment page;
// 3. the provider tells the server the result (and the client comes back);
// 4. a paid checkout becomes the next month and its payment.

export const CHECKOUT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'EXPIRED'] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

export interface CheckoutOptions {
  /** False when no online provider is set up: the portal hides the button. */
  enabled: boolean;
  /** "whish", or "fake" for the development simulator. */
  provider: string | null;
  plans: Plan[];
  /** The member's usual plan, when it is still on sale. */
  suggestedPlanId: string | null;
}

export const startCheckoutSchema = z.object({
  planId: z.string().min(1, 'validation.required'),
});

export interface CheckoutStarted {
  checkoutId: string;
  /** Where the browser goes to pay: the provider's page. */
  redirectUrl: string;
}

export interface CheckoutState {
  id: string;
  status: CheckoutStatus;
  planName: string;
  amountCents: number;
  currency: string;
  /** Set once paid: the month the payment bought. */
  period: { startDate: string; endDate: string } | null;
}
