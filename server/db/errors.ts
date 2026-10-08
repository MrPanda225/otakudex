/** True when a statement failed because it would break a UNIQUE constraint (PostgreSQL error 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
