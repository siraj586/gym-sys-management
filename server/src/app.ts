import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { checkInsRouter, memberAttendanceRouter } from './modules/attendance/attendance.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import {
  checkoutProviderRouter,
  portalCheckoutRouter,
} from './modules/checkout/checkout.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { membersRouter, subscriptionsRouter } from './modules/members/members.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { plansRouter } from './modules/plans/plans.routes.js';
import { portalRouter } from './modules/portal/portal.routes.js';
import {
  exercisesRouter,
  memberProgramRouter,
  programsRouter,
} from './modules/programs/programs.routes.js';
import { memberProgressRouter, progressEntriesRouter } from './modules/progress/progress.routes.js';
import {
  galleryRouter,
  messagesRouter,
  publicRouter,
  settingsRouter,
} from './modules/site/site.routes.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
// The payment provider's notifications are read as raw bytes (their signature
// covers them), so that router comes before the JSON parser.
app.use('/api/checkout', checkoutProviderRouter);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/portal/checkout', portalCheckoutRouter);
app.use('/api/portal', portalRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/plans', plansRouter);
app.use('/api/members/:id/attendance', memberAttendanceRouter);
app.use('/api/members/:id/program', memberProgramRouter);
app.use('/api/members/:id/progress', memberProgressRouter);
app.use('/api/members', membersRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/check-ins', checkInsRouter);
app.use('/api/exercises', exercisesRouter);
app.use('/api/programs', programsRouter);
app.use('/api/progress', progressEntriesRouter);

app.use(notFound);
app.use(errorHandler);
