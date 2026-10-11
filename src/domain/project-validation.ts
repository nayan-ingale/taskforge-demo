// Input validation for projects.
import { z } from 'zod';
import { NUL_MESSAGE, hasNoNul } from './text';

export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

/** Body of `POST /api/projects` (admin only). */
export const createProjectSchema = z.strictObject({
  key: z
    .string({ error: 'Key is required' })
    .trim()
    .regex(
      PROJECT_KEY_PATTERN,
      'Key must be 2-10 uppercase letters or digits and start with a letter',
    ),
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(3, 'Name must be at least 3 characters')
    .max(80, 'Name must be at most 80 characters')
    .refine(hasNoNul, NUL_MESSAGE),
  description: z
    .string()
    .trim()
    .max(2000, 'Description must be at most 2000 characters')
    .refine(hasNoNul, NUL_MESSAGE)
    .optional()
    .default(''),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
