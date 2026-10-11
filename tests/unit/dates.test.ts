import { describe, expect, it } from 'vitest';
import { isValidDateString, toDateString } from '@/domain/dates';

describe('isValidDateString', () => {
  it.each(['2026-10-20', '2024-02-29', '2026-12-31', '2026-01-01'])('accepts %s', (value) => {
    expect(isValidDateString(value)).toBe(true);
  });

  it.each([
    '2026-02-29', // not a leap year
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-1-5',
    '20261020',
    '2026-10-20T00:00:00Z',
    'tomorrow',
    '',
  ])('rejects %s', (value) => {
    expect(isValidDateString(value)).toBe(false);
  });
});

describe('toDateString', () => {
  it('uses the UTC calendar date', () => {
    expect(toDateString(new Date('2026-10-20T23:59:59.999Z'))).toBe('2026-10-20');
    expect(toDateString(new Date('2026-10-21T00:00:00.000Z'))).toBe('2026-10-21');
  });
});
