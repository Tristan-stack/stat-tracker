export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse l'en-tête `Retry-After` (secondes ou date HTTP) en millisecondes. */
export function parseRetryAfterHeader(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

/** Détermine si un échec HTTP/réseau justifie un retry (429, 5xx, erreurs réseau). */
export function isRetryableFailure(status: number, message: string): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|timeout|aborted/i.test(message);
}
