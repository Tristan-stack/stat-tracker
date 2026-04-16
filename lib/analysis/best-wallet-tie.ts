/** Hard ceiling for `maxTieWallets` (query param or env) to avoid unbounded GMGN load. */
export const BEST_WALLET_TIE_ABSOLUTE_MAX = 200;

const DEFAULT_ENV_TIE_MAX = 120;

export function resolveBestWalletTieMax(
  maxTieWalletsParam: string | null,
  envValue: number = Number(process.env.BEST_WALLET_TIE_MAX ?? String(DEFAULT_ENV_TIE_MAX))
): number {
  if (maxTieWalletsParam !== null && maxTieWalletsParam.trim() !== '') {
    const parsed = Number.parseInt(maxTieWalletsParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, BEST_WALLET_TIE_ABSOLUTE_MAX);
    }
  }
  const fromEnv = Number.isFinite(envValue) && envValue > 0 ? Math.floor(envValue) : DEFAULT_ENV_TIE_MAX;
  return Math.min(Math.max(1, fromEnv), BEST_WALLET_TIE_ABSOLUTE_MAX);
}

export function computeTieCapMeta(tiedAtMaxCount: number, returnedCount: number, maxTie: number): {
  tieCapApplied: boolean;
  tiedAfterCap: number;
} {
  const tieCapApplied = tiedAtMaxCount > maxTie && returnedCount < tiedAtMaxCount;
  return { tieCapApplied, tiedAfterCap: returnedCount };
}
