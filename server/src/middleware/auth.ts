import type { Role } from '@calisthenics/shared';
import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken, type AccessTokenUser } from '../lib/tokens.js';

/** Requires a valid access token and puts the user on req.user. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  const user = token ? verifyAccessToken(token) : null;

  if (!user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  req.user = user;
  next();
};

/** Use after requireAuth: only the listed roles may continue. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(currentUser(req).role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this.');
    }
    next();
  };
}

/** The signed-in user inside a route that is protected by requireAuth. */
export function currentUser(req: Request): AccessTokenUser {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  return req.user;
}
