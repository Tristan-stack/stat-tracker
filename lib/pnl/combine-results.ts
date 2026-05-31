import type { PnlBalance, PnlComputeResponse, PnlResult } from '@/types/pnl';

/** Adresse synthétique pour la carte combinée (non affichée comme vraie adresse). */
export const COMBINED_WALLET_ADDRESS = '__combined__';

/** Somme une métrique optionnelle : null seulement si toutes les valeurs sont null. */
function sumNullable(values: (number | null)[]): number | null {
  let total = 0;
  let hasValue = false;
  for (const v of values) {
    if (v !== null && Number.isFinite(v)) {
      total += v;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

function combineBalance(balances: (PnlBalance | null)[]): PnlBalance | null {
  const present = balances.filter((b): b is PnlBalance => b !== null);
  if (present.length === 0) return null;
  const solUsd = present.find((b) => b.solUsd !== null)?.solUsd ?? null;
  return {
    sol: present.reduce((acc, b) => acc + b.sol, 0),
    lamports: present.reduce((acc, b) => acc + b.lamports, 0),
    solUsd,
    valueUsd: sumNullable(present.map((b) => b.valueUsd)),
  };
}

/**
 * Combine plusieurs résultats wallet en un seul (carte agrégée).
 * Le PNL et la balance sont sommés ; le winrate est recalculé depuis les tokens
 * (ou, à défaut de détail par token, moyenné sur les wallets).
 */
export function combineResults(results: PnlComputeResponse[]): PnlComputeResponse | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0];

  const pnls = results.map((r) => r.pnl);
  const perToken = pnls.flatMap((p) => p.perToken);

  // Winrate : tokens gagnants / tokens vendus si le détail existe, sinon moyenne.
  const soldTokens = perToken.filter((t) => t.soldUsd > 0 || t.soldSol > 0);
  let winRatePercent: number | null;
  if (soldTokens.length > 0) {
    const winners = soldTokens.filter((t) => (t.realizedUsd ?? 0) > 0).length;
    winRatePercent = (winners / soldTokens.length) * 100;
  } else {
    const rates = pnls.map((p) => p.winRatePercent).filter((v): v is number => v !== null);
    winRatePercent = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  }

  const allGmgn = pnls.every((p) => p.source === 'gmgn_stats');

  const pnl: PnlResult = {
    realizedUsd: sumNullable(pnls.map((p) => p.realizedUsd)),
    realizedSol: sumNullable(pnls.map((p) => p.realizedSol)),
    unrealizedUsd: sumNullable(pnls.map((p) => p.unrealizedUsd)),
    boughtUsd: pnls.reduce((acc, p) => acc + p.boughtUsd, 0),
    soldUsd: pnls.reduce((acc, p) => acc + p.soldUsd, 0),
    boughtSol: pnls.reduce((acc, p) => acc + p.boughtSol, 0),
    soldSol: pnls.reduce((acc, p) => acc + p.soldSol, 0),
    tradeCount: pnls.reduce((acc, p) => acc + p.tradeCount, 0),
    tokenCount: pnls.reduce((acc, p) => acc + p.tokenCount, 0),
    winRatePercent,
    perToken,
    truncated: pnls.some((p) => p.truncated),
    source: allGmgn ? 'gmgn_stats' : 'activity',
  };

  const warnings = Array.from(new Set(results.flatMap((r) => r.warnings)));

  return {
    walletAddress: COMBINED_WALLET_ADDRESS,
    fromMs: results[0].fromMs,
    toMs: results[0].toMs,
    pnl,
    balance: combineBalance(results.map((r) => r.balance)),
    solUsd: results.find((r) => r.solUsd !== null)?.solUsd ?? null,
    warnings,
  };
}
