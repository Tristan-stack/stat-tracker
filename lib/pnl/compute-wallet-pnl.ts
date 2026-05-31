import { fetchSolUsdFromGmgn } from '@/lib/gmgn/first-buy-notional';
import { fetchWalletStats, type GmgnStatsPeriod } from '@/lib/gmgn/wallet-stats';
import {
  collectSolanaTradesInRange,
  type PnlTradeRow,
} from '@/lib/pnl/collect-solana-trades-in-range';
import type { PnlResult, PnlRangePreset, PnlTokenBreakdown } from '@/types/pnl';

const CHAIN_SOL = 'sol';

/** Les presets GMGN couverts par l'endpoint dédié `wallet_stats`. */
const GMGN_STATS_PERIODS: Record<'1d' | '7d' | '30d', GmgnStatsPeriod> = {
  '1d': '1d',
  '7d': '7d',
  '30d': '30d',
};

interface MutableTokenAgg {
  mint: string;
  tokenName: string | null;
  boughtUsd: number;
  soldUsd: number;
  boughtSol: number;
  soldSol: number;
  feeUsd: number;
  feeSol: number;
  tradeCount: number;
}

function aggregateTrades(rows: PnlTradeRow[]): {
  perToken: PnlTokenBreakdown[];
  totals: Omit<PnlResult, 'perToken' | 'truncated' | 'source' | 'unrealizedUsd'>;
} {
  const byMint = new Map<string, MutableTokenAgg>();

  for (const row of rows) {
    let agg = byMint.get(row.mint);
    if (!agg) {
      agg = {
        mint: row.mint,
        tokenName: row.tokenName,
        boughtUsd: 0,
        soldUsd: 0,
        boughtSol: 0,
        soldSol: 0,
        feeUsd: 0,
        feeSol: 0,
        tradeCount: 0,
      };
      byMint.set(row.mint, agg);
    }
    if (agg.tokenName === null && row.tokenName) agg.tokenName = row.tokenName;
    agg.tradeCount += 1;
    agg.feeUsd += row.feeUsd;
    agg.feeSol += row.feeSol;
    if (row.side === 'buy') {
      agg.boughtUsd += row.usd ?? 0;
      agg.boughtSol += row.sol ?? 0;
    } else {
      agg.soldUsd += row.usd ?? 0;
      agg.soldSol += row.sol ?? 0;
    }
  }

  let totalBoughtUsd = 0;
  let totalSoldUsd = 0;
  let totalBoughtSol = 0;
  let totalSoldSol = 0;
  let totalFeeUsd = 0;
  let totalFeeSol = 0;
  let tokensWithSell = 0;
  let winningTokens = 0;

  const perToken: PnlTokenBreakdown[] = [];
  for (const agg of byMint.values()) {
    const hasSell = agg.soldUsd > 0 || agg.soldSol > 0;
    // PNL réalisé net de frais (aligné sur la méthode GMGN : ventes − achats − frais).
    const realizedUsd = hasSell || agg.boughtUsd > 0 ? agg.soldUsd - agg.boughtUsd - agg.feeUsd : null;
    const realizedSol = hasSell || agg.boughtSol > 0 ? agg.soldSol - agg.boughtSol - agg.feeSol : null;

    totalBoughtUsd += agg.boughtUsd;
    totalSoldUsd += agg.soldUsd;
    totalBoughtSol += agg.boughtSol;
    totalSoldSol += agg.soldSol;
    totalFeeUsd += agg.feeUsd;
    totalFeeSol += agg.feeSol;

    if (hasSell) {
      tokensWithSell += 1;
      if ((realizedUsd ?? 0) > 0) winningTokens += 1;
    }

    perToken.push({
      mint: agg.mint,
      tokenName: agg.tokenName,
      boughtUsd: agg.boughtUsd,
      soldUsd: agg.soldUsd,
      boughtSol: agg.boughtSol,
      soldSol: agg.soldSol,
      realizedUsd,
      realizedSol,
      tradeCount: agg.tradeCount,
    });
  }

  perToken.sort((a, b) => (b.realizedUsd ?? 0) - (a.realizedUsd ?? 0));

  const winRatePercent = tokensWithSell > 0 ? (winningTokens / tokensWithSell) * 100 : null;

  return {
    perToken,
    totals: {
      realizedUsd: totalSoldUsd - totalBoughtUsd - totalFeeUsd,
      realizedSol: totalSoldSol - totalBoughtSol - totalFeeSol,
      boughtUsd: totalBoughtUsd,
      soldUsd: totalSoldUsd,
      boughtSol: totalBoughtSol,
      soldSol: totalSoldSol,
      tradeCount: rows.length,
      tokenCount: byMint.size,
      winRatePercent,
    },
  };
}

/**
 * Calcule le PNL d'un wallet sur la fenêtre demandée.
 *
 * - presets 7d / 30d (et 1d si l'API le supporte) → endpoint GMGN `wallet_stats` (chiffres alignés GMGN).
 * - sinon (custom, ou échec wallet_stats) → agrégation des achats/ventes GMGN sur [fromMs, toMs].
 */
export async function computeWalletPnl(
  walletAddress: string,
  fromMs: number,
  toMs: number,
  preset: PnlRangePreset
): Promise<{ result: PnlResult; warnings: string[]; solUsd: number | null }> {
  const warnings: string[] = [];

  const statsPeriod = preset !== 'custom' ? GMGN_STATS_PERIODS[preset] : null;
  if (statsPeriod) {
    try {
      const stats = await fetchWalletStats(CHAIN_SOL, walletAddress, statsPeriod);
      const hasSignal =
        stats.realizedProfit !== null ||
        stats.boughtUsd !== null ||
        stats.buyCount !== null ||
        stats.sellCount !== null;
      if (hasSignal) {
        // GMGN renvoie les montants en USD ; on convertit en SOL via le spot pour
        // l'affichage SOL (approximation au prix courant).
        let statsSolUsd: number | null = null;
        try {
          statsSolUsd = await fetchSolUsdFromGmgn();
        } catch {
          statsSolUsd = null;
        }
        const toSol = (usd: number | null): number | null =>
          usd !== null && statsSolUsd !== null && statsSolUsd > 0 ? usd / statsSolUsd : null;

        const result: PnlResult = {
          realizedUsd: stats.realizedProfit,
          realizedSol: toSol(stats.realizedProfit),
          unrealizedUsd: stats.unrealizedProfit,
          boughtUsd: stats.boughtUsd ?? 0,
          soldUsd: stats.soldUsd ?? 0,
          boughtSol: toSol(stats.boughtUsd) ?? 0,
          soldSol: toSol(stats.soldUsd) ?? 0,
          tradeCount: (stats.buyCount ?? 0) + (stats.sellCount ?? 0),
          tokenCount: stats.tokenCount ?? 0,
          winRatePercent: stats.winratePercent,
          perToken: [],
          truncated: false,
          source: 'gmgn_stats',
        };
        return { result, warnings, solUsd: statsSolUsd };
      }
      warnings.push('GMGN wallet_stats sans données ; calcul par agrégation d’activité.');
    } catch (e) {
      warnings.push(
        `GMGN wallet_stats indisponible (${e instanceof Error ? e.message : 'erreur'}) ; agrégation d’activité.`
      );
    }
  }

  // Fallback / custom : agrégation buys + sells.
  let solUsd: number | null = null;
  try {
    solUsd = await fetchSolUsdFromGmgn();
  } catch {
    solUsd = null;
  }

  const { rows, truncated } = await collectSolanaTradesInRange(walletAddress, fromMs, toMs, solUsd);
  if (truncated) {
    warnings.push('Activité GMGN tronquée par la pagination : résultats potentiellement partiels.');
  }
  const unpriced = rows.filter((r) => r.usd === null && r.sol === null).length;
  if (rows.length > 0 && unpriced / rows.length > 0.2) {
    warnings.push(`${unpriced}/${rows.length} trades sans montant exploitable (PNL sous-estimé).`);
  }

  const { perToken, totals } = aggregateTrades(rows);
  const result: PnlResult = {
    ...totals,
    unrealizedUsd: null,
    perToken,
    truncated,
    source: 'activity',
  };
  return { result, warnings, solUsd };
}
