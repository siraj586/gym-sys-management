import { loginSchema, registerSchema, type AuthResponse } from '@calisthenics/shared';
import { Router, type CookieOptions, type Request, type Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { currentUser, requireAuth } from '../../middleware/auth.js';
import { authRateLimit } from '../../middleware/rateLimit.js';
import * as authService from './auth.service.js';

const REFRESH_COOKIE = 'refresh_token';

// httpOnly: JavaScript cannot read it. sameSite strict: other sites cannot send it.
// path: the browser only attaches it to /api/auth requests.
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
};

function refreshTokenFrom(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

function sendSession(res: Response, session: authService.Session, status = 200) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...cookieOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
  const body: AuthResponse = { accessToken: session.accessToken, user: session.user };
  res.status(status).json(body);
}

export const authRouter = Router();

authRouter.post('/register', authRateLimit, async (req, res) => {
  sendSession(res, await authService.register(registerSchema.parse(req.body)), 201);
});

authRouter.post('/login', authRateLimit, async (req, res) => {
  sendSession(res, await authService.login(loginSchema.parse(req.body)));
});

authRouter.post('/refresh', async (req, res) => {
  try {
    sendSession(res, await authService.refresh(refreshTokenFrom(req)));
  } catch (err) {
    if (err instanceof AppError && err.code === 'INVALID_REFRESH_TOKEN') {
      res.clearCookie(REFRESH_COOKIE, cookieOptions);
    }
    throw err;
  }
});

authRouter.post('/logout', async (req, res) => {
  await authService.logout(refreshTokenFrom(req));
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await authService.getCurrentUser(currentUser(req).id) });
});
