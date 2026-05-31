import { gmgnGet } from '@/lib/gmgn/client';

/** Périodes supportées par l'endpoint GMGN `/v1/user/wallet_stats`. */
export type GmgnStatsPeriod = '1d' | '7d' | '30d';

export interface GmgnWalletStats {
  realizedProfit: number | null;
  unrealizedProfit: number | null;
  /** Winrate en pourcentage (0–100). */
  winratePercent: number | null;
  boughtUsd: number | null;
  soldUsd: number | null;
  totalCost: number | null;
  buyCount: number | null;
  sellCount: number | null;
  tokenCount: number | null;
}

/** Lit un nombre signé (les profits peuvent être négatifs ; GMGN renvoie souvent des strings). */
function readSignedNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.trim().replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Normalise un winrate GMGN : fraction (0–1) → pourcentage, sinon laissé tel quel. */
function normalizeWinrate(raw: number | null): number | null {
  if (raw === null) return null;
  if (raw >= 0 && raw <= 1) return raw * 100;
  return raw;
}

/**
 * Récupère les stats PNL agrégées d'un wallet via GMGN openapi `/v1/user/wallet_stats`.
 *
 * Réponse `data` observée : realized_profit, bought_cost, sold_income, total_cost,
 * buy, sell, native_balance, pnl_stat { winrate, token_num, ... }.
 */
export async function fetchWalletStats(
  chain: 'sol',
  wallet: string,
  period: GmgnStatsPeriod
): Promise<GmgnWalletStats> {
  const payload = await gmgnGet<unknown>('/v1/user/wallet_stats', {
    chain,
    wallet_address: wallet,
    period,
  });

  const root = asRecord(payload);
  const pnlStat = asRecord(root.pnl_stat);

  const winrateRaw = readSignedNumber(pnlStat, ['winrate', 'win_rate']);

  return {
    realizedProfit: readSignedNumber(root, ['realized_profit', 'realized_pnl']),
    unrealizedProfit: readSignedNumber(root, ['unrealized_profit', 'unrealized_pnl']),
    winratePercent: normalizeWinrate(winrateRaw),
    boughtUsd: readSignedNumber(root, ['bought_cost', 'total_cost']),
    soldUsd: readSignedNumber(root, ['sold_income']),
    totalCost: readSignedNumber(root, ['total_cost', 'bought_cost']),
    buyCount: readSignedNumber(root, ['buy', 'buy_count']),
    sellCount: readSignedNumber(root, ['sell', 'sell_count']),
    tokenCount: readSignedNumber(pnlStat, ['token_num']),
  };
}
