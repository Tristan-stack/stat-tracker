const DATA_IMAGE_SAFE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;
const MAX_DATA_URL_CHARS = 6_000_000;

/**
 * URL http(s) utilisateur (ex. lien dans une description) — refuse javascript:, data:, etc.
 */
export function safeUserHttpUrl(raw: string): string | undefined {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.href;
  } catch {
    return undefined;
  }
}

/**
 * `src` d’image ou `url()` CSS : data:image sûrs ou blob: créé localement.
 */
export function safeImageOrBlobUrl(url: string | null | undefined): string | undefined {
  if (url == null || typeof url !== 'string') return undefined;
  const u = url.trim();
  if (DATA_IMAGE_SAFE.test(u) && u.length <= MAX_DATA_URL_CHARS) return u;
  if (u.startsWith('blob:') && /^blob:[^#'"]+$/.test(u) && u.length < 4096) return u;
  return undefined;
}
