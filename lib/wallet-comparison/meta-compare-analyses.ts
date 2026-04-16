import type { CompareResponseSnapshot } from '@/lib/wallet-comparison/session-comparison-cache';

export interface MetaWalletAggregate {
  walletAddress: string;
  /** Nombre d’analyses sélectionnées où ce wallet était dans le comparatif (walletsCompared). */
  analysesIncluded: number;
  /** Combien de fois ce wallet figure parmi les gagnants globaux de l’analyse (globalWinnerWallets). */
  timesTopWinner: number;
  /** Somme des victoires (sur tokens communs) sur toutes les analyses où il participait. */
  winsTotal: number;
}

/**
 * Agrège plusieurs résultats de comparaison (mêmes ou autres périodes / sets) pour classer les wallets.
 * Tri : timesTopWinner desc, winsTotal desc, analysesIncluded desc, adresse.
 */
export function aggregateAnalysesForGlobalBest(results: CompareResponseSnapshot[]): {
  aggregates: MetaWalletAggregate[];
  globalBestWallets: string[];
} {
  if (results.length === 0) {
    return { aggregates: [], globalBestWallets: [] };
  }

  const map = new Map<
    string,
    { walletAddress: string; analysesIncluded: number; timesTopWinner: number; winsTotal: number }
  >();

  for (const r of results) {
    const winnerKeys = new Set(r.globalWinnerWallets.map((w) => w.trim().toLowerCase()));

    for (const wAddr of r.walletsCompared) {
      const k = wAddr.trim().toLowerCase();
      if (k === '') continue;
      const scoreRow = r.scores.find((s) => s.walletAddress.trim().toLowerCase() === k);
      const wins = scoreRow?.wins ?? 0;
      const isTop = winnerKeys.has(k);
      const prev = map.get(k);
      if (!prev) {
        map.set(k, {
          walletAddress: wAddr.trim(),
          analysesIncluded: 1,
          timesTopWinner: isTop ? 1 : 0,
          winsTotal: wins,
        });
      } else {
        map.set(k, {
          walletAddress: prev.walletAddress,
          analysesIncluded: prev.analysesIncluded + 1,
          timesTopWinner: prev.timesTopWinner + (isTop ? 1 : 0),
          winsTotal: prev.winsTotal + wins,
        });
      }
    }
  }

  const aggregates: MetaWalletAggregate[] = [...map.values()].sort(
    (a, b) =>
      b.timesTopWinner - a.timesTopWinner ||
      b.winsTotal - a.winsTotal ||
      b.analysesIncluded - a.analysesIncluded ||
      a.walletAddress.localeCompare(b.walletAddress)
  );

  const top = aggregates[0];
  const globalBestWallets =
    top !== undefined
      ? aggregates
          .filter(
            (a) =>
              a.timesTopWinner === top.timesTopWinner &&
              a.winsTotal === top.winsTotal &&
              a.analysesIncluded === top.analysesIncluded
          )
          .map((a) => a.walletAddress)
          .sort((x, y) => x.localeCompare(y))
      : [];

  return { aggregates, globalBestWallets };
}
