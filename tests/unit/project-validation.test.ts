import { describe, expect, it } from 'vitest';
import { createProjectSchema } from '@/domain/project-validation';

describe('createProjectSchema', () => {
  it('accepts a valid project and defaults the description', () => {
    expect(createProjectSchema.parse({ key: 'OPS', name: 'Operations' })).toEqual({
      key: 'OPS',
      name: 'Operations',
      description: '',
    });
  });

  it.each(['ops', 'O', '1OPS', 'OPS-1', 'ABCDEFGHIJK', ''])('rejects key %j', (key) => {
    expect(createProjectSchema.safeParse({ key, name: 'Operations' }).success).toBe(false);
  });

  it.each(['OP', 'OPS2', 'ABCDEFGHIJ'])('accepts key %j', (key) => {
    expect(createProjectSchema.safeParse({ key, name: 'Operations' }).success).toBe(true);
  });

  it('requires a 3-80 character name', () => {
    expect(createProjectSchema.safeParse({ key: 'OPS', name: 'Op' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ key: 'OPS', name: 'x'.repeat(81) }).success).toBe(false);
  });
});
