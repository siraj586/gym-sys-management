import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  CreatedSession,
  CreateSessionInput,
  PaymentProvider,
  ProviderOutcome,
  RawNotification,
} from './types.js';

/**
 * A pretend payment provider for development and tests. Its "payment page" is
 * served by this app (/api/checkout/fake/<ref>) with two buttons: pay or cancel.
 * It signs its notifications like a real provider would, so the whole flow,
 * signature check included, runs end to end. Refused in production (env.ts).
 */
export const FAKE_SECRET = 'development-only-fake-provider-secret';
export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';

interface FakeSession {
  checkoutId: string;
  amountCents: number;
  currency: string;
  description: string;
  returnUrl: string;
  status: 'PENDING' | 'PAID' | 'FAILED';
}

export function sign(body: string): string {
  return createHmac('sha256', FAKE_SECRET).update(body).digest('hex');
}

export class FakeProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  // Lives in memory: a restart forgets sessions, which is fine for a simulator.
  readonly sessions = new Map<string, FakeSession>();

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    const providerRef = `fake_${randomBytes(9).toString('base64url')}`;
    this.sessions.set(providerRef, {
      checkoutId: input.checkoutId,
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      returnUrl: input.returnUrl,
      status: 'PENDING',
    });
    // Relative: the simulated page is served by this app, behind the same origin.
    return { providerRef, redirectUrl: `/api/checkout/fake/${providerRef}` };
  }

  /** The body the simulated page sends when the client presses a button. */
  notificationFor(
    providerRef: string,
    status: 'PAID' | 'FAILED',
  ): { body: string; signature: string } {
    const session = this.sessions.get(providerRef);
    if (!session) throw new Error('Unknown fake session');
    session.status = status;
    const body = JSON.stringify({
      ref: providerRef,
      status,
      amountCents: session.amountCents,
      currency: session.currency,
    });
    return { body, signature: sign(body) };
  }

  async verifyNotification(raw: RawNotification): Promise<ProviderOutcome | null> {
    const given = raw.headers[FAKE_SIGNATURE_HEADER];
    if (typeof given !== 'string') return null;
    const expected = Buffer.from(sign(raw.body.toString('utf8')));
    const received = Buffer.from(given);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

    const data = JSON.parse(raw.body.toString('utf8')) as {
      ref: string;
      status: 'PAID' | 'FAILED';
      amountCents: number;
      currency: string;
    };
    return {
      providerRef: data.ref,
      status: data.status,
      amountCents: data.amountCents,
      currency: data.currency,
      reason: data.status === 'FAILED' ? 'Cancelled on the simulated page' : undefined,
    };
  }

  async fetchStatus(providerRef: string) {
    const session = this.sessions.get(providerRef);
    if (!session || session.status === 'PENDING')
      return { providerRef, status: 'PENDING' as const };
    return {
      providerRef,
      status: session.status,
      amountCents: session.amountCents,
      currency: session.currency,
    };
  }
}
