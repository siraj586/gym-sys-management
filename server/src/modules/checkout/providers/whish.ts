import { AppError } from '../../../lib/errors.js';
import type { CreatedSession, PaymentProvider, ProviderOutcome } from './types.js';

/**
 * Whish Pay. NOT WRITTEN YET: Whish shares its merchant API documentation with
 * merchants only, and nothing here may be guessed, because a wrong guess could
 * mark a payment as paid when it was not.
 *
 * Once the documentation and a Whish Business account are available, fill in
 * the three methods below. The questions the documentation must answer:
 *
 * createSession
 *   - Which endpoint creates a payment, and how is the request authenticated
 *     (channel, secret, a token, a signature)?
 *   - Which fields does it take: amount (in cents or units?), currency, our
 *     order id (checkoutId), description, success/failure return URLs, the
 *     notification (callback) URL, the customer's phone?
 *   - What comes back: the payment id (providerRef) and the page to send the
 *     client to (redirectUrl)? Is there a sandbox for testing?
 *
 * verifyNotification
 *   - How does Whish tell us the result: a POST to notifyUrl, a GET on the
 *     return URL, or both? What do the fields and statuses look like?
 *   - How is a notification proven to come from Whish (an HMAC header over
 *     the raw body, a signature field, or a callback we must confirm with
 *     fetchStatus)? Return null whenever that proof fails.
 *   - May the same notification arrive more than once? (The checkout service
 *     already handles repeats.)
 *
 * fetchStatus
 *   - Which endpoint returns a payment's status by its id, and its statuses?
 *
 * Settings already reserved in env.ts: WHISH_API_URL, WHISH_CHANNEL,
 * WHISH_SECRET (rename or add what the documentation calls for).
 */
export class WhishProvider implements PaymentProvider {
  readonly name = 'whish' as const;

  constructor(
    private readonly config: {
      apiUrl: string | undefined;
      channel: string | undefined;
      secret: string | undefined;
    },
  ) {}

  private notReady(): never {
    throw new AppError(
      503,
      'PROVIDER_NOT_READY',
      'Whish Pay is not connected yet. Pay at the gym in the meantime.',
    );
  }

  // To write: takes a CreateSessionInput (see the questions above).
  async createSession(): Promise<CreatedSession> {
    void this.config;
    return this.notReady();
  }

  // To write: takes the RawNotification and proves it came from Whish.
  async verifyNotification(): Promise<ProviderOutcome | null> {
    // Until it is written, nothing from outside is trusted.
    return null;
  }

  async fetchStatus(providerRef: string): Promise<{ providerRef: string; status: 'PENDING' }> {
    return { providerRef, status: 'PENDING' };
  }
}
