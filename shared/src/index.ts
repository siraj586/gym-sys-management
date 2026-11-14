import { z } from 'zod';

/** Account roles. The owner manages the gym; a client only sees their own data. */
export const ROLES = ['OWNER', 'CLIENT'] as const;
export type Role = (typeof ROLES)[number];

/** Every error response from the API has this shape. */
export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
