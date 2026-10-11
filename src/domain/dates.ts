// Calendar-date helpers. Due dates are plain `YYYY-MM-DD` strings (no time zone);
// "today" is always derived from an injected clock in UTC so behaviour is deterministic.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when `value` is a real calendar date written as `YYYY-MM-DD` (e.g. rejects 2026-02-30). */
export function isValidDateString(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The UTC calendar date of `now` as `YYYY-MM-DD`. */
export function toDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}
