/**
 * Accepte `@slug`, une URL https://t.me/slug ou un slug brut ; retourne le slug minuscule.
 */
export function normalizeTelegramUsername(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^https?:\/\/(?:t\.me|telegram\.(?:me|dog))\//i, '');
  // Préfixes /s /c (preview canaux) après le domaine éventuel
  s = s.replace(/^s\//i, '');
  s = s.replace(/^c\//i, '');
  s = s.replace(/^@+/, '');
  const slug = s.split(/[/\s?#]/)[0] ?? '';
  return slug.toLowerCase().trim();
}
