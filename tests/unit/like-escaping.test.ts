import { describe, expect, it } from 'vitest';
import { escapeLikePattern } from '@/server/repositories/task-repository';

describe('escapeLikePattern', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('user_id')).toBe('user\\_id');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLikePattern('Login page')).toBe('Login page');
  });
});
