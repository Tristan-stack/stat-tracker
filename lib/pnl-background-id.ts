/** Identifiants `pnl_backgrounds.id` générés par Postgres `gen_random_uuid()` (UUID v4). */
export const PNL_BACKGROUND_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPnlBackgroundRowId(id: string): boolean {
  return PNL_BACKGROUND_ID_RE.test(id);
}
