/** Plafond de mints vérifés pour le filtre Pump Mayhem (aligné leaderboard / résolution bulk). */
export function telegramMayhemMintResolveCap(): number {
  const raw = process.env.TELEGRAM_LEADERBOARD_MAYHEM_MAX_MINTS?.trim() ?? '';
  const n = raw === '' ? 100 : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 100;
  return Math.min(Math.floor(n), 400);
}
