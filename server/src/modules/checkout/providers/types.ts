/**
 * What the app needs from an online payment provider. The checkout service
 * only talks to this interface, so connecting Whish Pay means writing one
 * class (whish.ts) and nothing else.
 */
export interface PaymentProvider {
  /** Matches PAYMENT_PROVIDER and the notification path /api/checkout/notify/<name>. */
  readonly name: 'fake' | 'whish';

  /** Creates the provider's payment page for one checkout. */
  createSession(input: CreateSessionInput): Promise<CreatedSession>;

  /**
   * Reads a notification the provider sent to our notify URL and checks that
   * it really comes from the provider (signature, shared secret...). Returns
   * null for anything that cannot be trusted: it is then ignored.
   */
  verifyNotification(raw: RawNotification): Promise<ProviderOutcome | null>;

  /**
   * Asks the provider directly how a payment ended. Used when the client comes
   * back before the notification arrived, or if a notification was lost.
   */
  fetchStatus(
    providerRef: string,
  ): Promise<ProviderOutcome | { providerRef: string; status: 'PENDING' }>;
}

export interface CreateSessionInput {
  /** Our id for this attempt; providers usually call it the order id. */
  checkoutId: string;
  amountCents: number;
  /** Three-letter code, e.g. USD. */
  currency: string;
  /** Shown on the payment page, e.g. "Monthly membership — Sami Calisthenics". */
  description: string;
  customer: { name: string; phone: string; email: string | null };
  /** Where the provider sends the client's browser afterwards. */
  returnUrl: string;
  /** Where the provider posts the result (server to server). */
  notifyUrl: string;
}

export interface CreatedSession {
  /** The provider's id for this payment; notifications carry it. */
  providerRef: string;
  /** The payment page the client's browser is sent to. */
  redirectUrl: string;
}

export interface RawNotification {
  headers: Record<string, string | string[] | undefined>;
  /** The exact bytes received: signatures are computed over them. */
  body: Buffer;
}

export interface ProviderOutcome {
  providerRef: string;
  status: 'PAID' | 'FAILED';
  /** What the provider says was paid; checked against the checkout when given. */
  amountCents?: number;
  currency?: string;
  /** Why it failed, in the provider's words, for the record. */
  reason?: string;
}
