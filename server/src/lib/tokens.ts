import { ROLES, type Role } from '@calisthenics/shared';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';

export interface AccessTokenUser {
  id: string;
  role: Role;
}

const payloadSchema = z.object({ sub: z.string().min(1), role: z.enum(ROLES) });

/** Short-lived token the client sends on every request (Authorization: Bearer ...). */
export function signAccessToken(user: AccessTokenUser): string {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60,
  });
}

/** Returns the user, or null when the token is missing, altered or expired. */
export function verifyAccessToken(token: string): AccessTokenUser | null {
  try {
    const payload = payloadSchema.parse(
      jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }),
    );
    return { id: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

/**
 * Long-lived random token kept in an httpOnly cookie. Only its hash is stored,
 * so a leaked database cannot be used to sign in as anyone.
 */
export function newRefreshToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
