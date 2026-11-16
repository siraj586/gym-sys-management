import type { AuthUser, LoginInput, RegisterInput } from '@calisthenics/shared';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { hashRefreshToken, newRefreshToken, signAccessToken } from '../../lib/tokens.js';

const withMember = {
  member: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.UserInclude;

type UserWithMember = Prisma.UserGetPayload<{ include: typeof withMember }>;

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * Two browser tabs renewing the same session at the same moment is normal.
 * A refresh token presented again after this window was copied by someone else.
 */
const REFRESH_RACE_WINDOW_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
const invalidRefreshToken = () =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your session has ended. Sign in again.');
const refreshRace = () =>
  new AppError(401, 'REFRESH_RACE', 'This session was just renewed. Try again.');

function toAuthUser(user: UserWithMember): AuthUser {
  return { id: user.id, email: user.email, role: user.role, member: user.member };
}

async function startSession(
  user: UserWithMember,
  db: Prisma.TransactionClient = prisma,
): Promise<Session> {
  const { token, tokenHash } = newRefreshToken();
  await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    },
  });
  return {
    accessToken: signAccessToken({ id: user.id, role: user.role }),
    refreshToken: token,
    user: toAuthUser(user),
  };
}

/** Self-registration always creates a CLIENT with a member profile. */
export async function register(input: RegisterInput): Promise<Session> {
  const passwordHash = await hashPassword(input.password);
  let user: UserWithMember;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: 'CLIENT',
        member: {
          create: {
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            email: input.email,
          },
        },
      },
      include: withMember,
    });
  } catch (err) {
    // P2002 = unique constraint: the database, not a prior SELECT, decides duplicates.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    }
    throw err;
  }
  return startSession(user);
}

export async function login(input: LoginInput): Promise<Session> {
  const user = await prisma.user.findUnique({ where: { email: input.email }, include: withMember });

  if (!user) {
    await verifyAgainstDummy(input.password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw invalidCredentials();
  }
  if (!user.isActive) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Contact the gym.');
  }

  // Housekeeping: drop this user's long-expired sessions.
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } },
  });
  return startSession(user);
}

/** Swaps a refresh token for a new one (rotation). Each token works exactly once. */
export async function refresh(token: string | undefined): Promise<Session> {
  if (!token) throw invalidRefreshToken();

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    include: { user: { include: withMember } },
  });
  if (!stored) throw invalidRefreshToken();

  if (stored.revokedAt) {
    if (Date.now() - stored.revokedAt.getTime() <= REFRESH_RACE_WINDOW_MS) {
      throw refreshRace();
    }
    // An old token came back: assume theft and end every session of this user.
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw invalidRefreshToken();
  }
  if (stored.expiresAt <= new Date() || !stored.user.isActive) {
    throw invalidRefreshToken();
  }

  return prisma.$transaction(async (tx) => {
    // Only one request can flip revokedAt from null, so a token is never used twice.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) throw refreshRace();
    return startSession(stored.user, tx);
  });
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getCurrentUser(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: withMember });
  if (!user || !user.isActive) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  }
  return toAuthUser(user);
}
