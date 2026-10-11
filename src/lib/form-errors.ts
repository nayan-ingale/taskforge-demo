// Turns `{ field: [messages] }` (zod's flattenError().fieldErrors or an API validation_failed
// error's details.fieldErrors) into `{ field: firstMessage }` for inline form errors.
export function firstFieldErrors<Field extends string>(
  fieldErrors: Partial<Record<string, string[]>>,
  fields: readonly Field[],
): Partial<Record<Field, string>> {
  const result: Partial<Record<Field, string>> = {};
  for (const field of fields) {
    const message = fieldErrors[field]?.[0];
    if (message) result[field] = message;
  }
  return result;
}
