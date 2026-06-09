/** Coercition partagée (remplace les `toNum`/`toHour` dupliqués dans les routes ruggers). */

export function toNullableNumber(v: unknown): number | null {
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

/** Heure de la journée valide (0–23), sinon null. */
export function toHour(v: unknown): number | null {
  const n = toNullableNumber(v);
  return n != null && n >= 0 && n <= 23 ? n : null;
}

/** Trim → null si vide. */
export function trimToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/** Saisie texte → nombre, ou null si vide/invalide (formulaires). */
export function parseNumericInput(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Saisie texte → heure 0–23, ou null (formulaires). */
export function parseHourInput(s: string): number | null {
  const n = parseNumericInput(s);
  return n != null && n >= 0 && n <= 23 ? n : null;
}
