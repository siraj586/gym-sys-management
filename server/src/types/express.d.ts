import type { AccessTokenUser } from '../lib/tokens.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      user?: AccessTokenUser;
    }
  }
}

export {};
