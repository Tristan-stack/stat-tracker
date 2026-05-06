const DATA_IMAGE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([0-9A-Za-z+/=\s]+)$/i;

export function parseStoredPnlDataUrlToResponseParts(imageData: string):
  | { contentType: string; body: Buffer }
  | null {
  const m = imageData.trim().match(DATA_IMAGE);
  if (!m) return null;
  const contentType = m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, '');
  try {
    const body = Buffer.from(b64, 'base64');
    if (body.length === 0 || body.length > 6_000_000) return null;
    return { contentType, body };
  } catch {
    return null;
  }
}
