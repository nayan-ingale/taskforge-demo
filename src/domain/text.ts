// PostgreSQL `text` cannot store NUL (U+0000) characters; inputs containing them are rejected
// by validation instead of failing later with a database error (500).
export const NUL_MESSAGE = 'Must not contain NUL characters';

export function hasNoNul(value: string): boolean {
  return !value.includes('\u0000');
}
