/**
 * Détecte les erreurs Postgres exposées par le driver (Neon / pg).
 */
export function getPostgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    const c = (cause as { code: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return undefined;
}
