// Identifiers are UUIDs. This lenient pattern accepts any 8-4-4-4-12 hex string, which is
// exactly what PostgreSQL's `uuid` type accepts, so a value that passes never makes a query fail.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
