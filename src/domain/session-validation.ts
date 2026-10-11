// Input validation for the demo login.
import { z } from 'zod';
import { UUID_PATTERN } from './ids';

/** Body of `POST /api/session`. */
export const createSessionSchema = z.strictObject({
  userId: z.string({ error: 'User id is required' }).regex(UUID_PATTERN, 'User id must be a UUID'),
});
