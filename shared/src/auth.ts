import { z } from 'zod';
import type { Role } from './roles.js';

// Validation messages are translation keys: the client shows t(message),
// so the same rule reads correctly in English and Arabic.

const email = z.string().trim().toLowerCase().pipe(z.email('validation.email'));
const name = z.string().trim().min(1, 'validation.required').max(50, 'validation.tooLong');

export const registerSchema = z.object({
  firstName: name,
  lastName: name,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/, 'validation.phone'),
  email,
  password: z.string().min(8, 'validation.passwordMin').max(128, 'validation.tooLong'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'validation.required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** What the client knows about the signed-in account. Never includes the password hash. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  member: { id: string; firstName: string; lastName: string } | null;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}
