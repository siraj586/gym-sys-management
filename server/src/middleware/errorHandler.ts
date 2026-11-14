import type { ApiErrorBody } from '@calisthenics/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

// Express recognises an error handler by its four parameters, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' },
  };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request is not valid.',
        details: err.issues,
      },
    };
  } else if (isBodyParseError(err)) {
    status = 400;
    body = { error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } };
  } else {
    // Unexpected: log the real error, but never send its details to the client.
    console.error(err);
  }

  res.status(status).json(body);
};

/** express.json() throws this when the request body cannot be parsed. */
function isBodyParseError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: unknown }).type === 'entity.parse.failed'
  );
}
