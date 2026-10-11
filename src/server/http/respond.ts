// Response helpers. Every error response has exactly one shape:
//   { "error": { "code": string, "message": string, "details"?: unknown } }
import type { ApiErrorBody, ErrorCode } from '@/lib/api-types';
import { AppError } from '../errors';

export function errorBody(code: ErrorCode, message: string, details?: unknown): ApiErrorBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}

export const INTERNAL_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Maps any thrown value to an error Response. Unknown errors are reported via `logError`
 * (server-side only) and answered with a generic 500.
 */
export function toErrorResponse(error: unknown, logError: (error: unknown) => void): Response {
  if (error instanceof AppError) {
    return jsonResponse(errorBody(error.code, error.message, error.details), error.status);
  }
  logError(error);
  return jsonResponse(errorBody('internal_error', INTERNAL_ERROR_MESSAGE), 500);
}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const response = Response.json(body, { status, headers });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export function noContent(headers?: HeadersInit): Response {
  const response = new Response(null, { status: 204, headers });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
