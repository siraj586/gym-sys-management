import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Online payments. "none": the "pay online" button is hidden. "fake": a
  // simulated payment page for local testing (refused in production).
  // "whish": Whish Pay, once its integration is written from Whish's documents.
  PAYMENT_PROVIDER: z.enum(['none', 'fake', 'whish']).default('none'),
  // Where clients come back after paying and where the provider sends its
  // notifications. Defaults to CLIENT_ORIGIN (the Vite proxy in development).
  PUBLIC_URL: z.url().optional(),
  WHISH_API_URL: z.url().optional(),
  WHISH_CHANNEL: z.string().optional(),
  WHISH_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast: a server with a broken configuration must not start.
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.PAYMENT_PROVIDER === 'fake') {
  // The simulated provider confirms any payment it is asked to: never in production.
  console.error('PAYMENT_PROVIDER=fake is for development only.');
  process.exit(1);
}

export const env = parsed.data;
