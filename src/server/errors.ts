// Application errors. Services throw AppError (via the helpers below); the HTTP layer
// (src/server/http/respond.ts) turns it into the single JSON error shape. Any other thrown value
// becomes a generic 500 that never exposes the original message, stack trace or SQL.
import { z } from 'zod';
import type { ErrorCode, ValidationDetails } from '@/lib/api-types';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function validationFailed(
  message: string,
  details: ValidationDetails = { fieldErrors: {}, formErrors: [] },
): AppError {
  return new AppError(400, 'validation_failed', message, details);
}

/** Converts a zod error into a 400 with `details: { fieldErrors, formErrors }`. */
export function fromZodError(error: z.ZodError): AppError {
  const flat = z.flattenError(error);
  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(flat.fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) fieldErrors[field] = messages as string[];
  }
  return validationFailed('Validation failed', { fieldErrors, formErrors: flat.formErrors });
}

/** Parses `input` with `schema` or throws a 400 validation_failed AppError. */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw fromZodError(result.error);
  return result.data;
}

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'You do not have permission to do that') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

export const invalidTransition = (message: string, details?: unknown) =>
  new AppError(422, 'invalid_transition', message, details);
