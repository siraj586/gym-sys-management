import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { membersRouter, subscriptionsRouter } from './modules/members/members.routes.js';
import { paymentsRouter } from './modules/payments/payments.routes.js';
import { plansRouter } from './modules/plans/plans.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/plans', plansRouter);
app.use('/api/members', membersRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/payments', paymentsRouter);

app.use(notFound);
app.use(errorHandler);
