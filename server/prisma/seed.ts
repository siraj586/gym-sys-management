// Creates the gym owner account and the settings row. Safe to run more than once.
import 'dotenv/config';
import { z } from 'zod';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';

const input = z
  .object({
    OWNER_EMAIL: z.string().trim().toLowerCase().pipe(z.email('OWNER_EMAIL is not an email')),
    OWNER_PASSWORD: z
      .string()
      .min(12, 'OWNER_PASSWORD must be at least 12 characters')
      .refine((value) => !value.startsWith('replace-me'), 'Set a real OWNER_PASSWORD in .env'),
    BUSINESS_NAME: z.string().trim().min(1).default('Calisthenics Coach'),
  })
  .safeParse(process.env);

if (!input.success) {
  for (const issue of input.error.issues)
    console.error(`${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}
const { OWNER_EMAIL, OWNER_PASSWORD, BUSINESS_NAME } = input.data;

const existing = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
if (existing) {
  console.log(`Account ${OWNER_EMAIL} already exists (${existing.role}); left unchanged.`);
} else {
  await prisma.user.create({
    data: { email: OWNER_EMAIL, passwordHash: await hashPassword(OWNER_PASSWORD), role: 'OWNER' },
  });
  console.log(`Owner account created: ${OWNER_EMAIL}`);
}

await prisma.settings.upsert({
  where: { id: 1 },
  update: {},
  create: { businessName: BUSINESS_NAME },
});

await prisma.$disconnect();
