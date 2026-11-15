import { env } from '../../../config/env.js';
import { FakeProvider } from './fake.js';
import type { PaymentProvider } from './types.js';
import { WhishProvider } from './whish.js';

function fromEnv(): PaymentProvider | null {
  switch (env.PAYMENT_PROVIDER) {
    case 'fake':
      return new FakeProvider();
    case 'whish':
      return new WhishProvider({
        apiUrl: env.WHISH_API_URL,
        channel: env.WHISH_CHANNEL,
        secret: env.WHISH_SECRET,
      });
    case 'none':
      return null;
  }
}

let current: PaymentProvider | null = fromEnv();

/** The configured online payment provider, or null when online payment is off. */
export function paymentProvider(): PaymentProvider | null {
  return current;
}

/** Tests switch providers without restarting. */
export function usePaymentProvider(provider: PaymentProvider | null): void {
  current = provider;
}
