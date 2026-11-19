/**
 * Escapes the LIKE/ILIKE metacharacters (`\`, `%`, `_`) so user text is matched literally.
 *
 * Prisma compiles `startsWith` / `contains` / `equals` with `mode: 'insensitive'` to `ILIKE $1`
 * with the value passed through UNESCAPED, so `%` or `_` typed by a user act as wildcards. Without
 * this, searching `%%` lists every patient in the caller's scope, defeating the rule that patient
 * search needs specific criteria. Use it for every user-supplied value in such filters.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
