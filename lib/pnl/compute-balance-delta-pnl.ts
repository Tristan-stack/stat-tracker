import {
  getEnhancedTransactionsByAddress,
  getRawTransaction,
  getSignaturesForAddress,
  LAMPORTS_PER_SOL,
  type RawTransaction,
} from '@/lib/helius/client';
import { fetchSolUsdFromHeliusDas } from '@/lib/helius/sol-spot';
import { fetchWalletBalance } from '@/lib/pnl/wallet-balance';
import type { PnlBalance, PnlResult } from '@/types/pnl';

/** Pagination des signatures : 1000/page, plafonnée pour borner coût/temps. */
const MAX_SIG_PAGES = 40;
const SIG_PAGE_LIMIT = 1000;
/** Pagination des transferts (type TRANSFER, peu nombreux) pour exclure dépôts/retraits. */
const MAX_TRANSFER_PAGES = 20;
/** `toMs` est considéré « maintenant » (→ solde de fin = getBalance) si dans cette marge. */
const NOW_SLACK_MS = 5 * 60 * 1000;

export interface BalanceDeltaPnl {
  result: PnlResult;
  warnings: string[];
  solUsd: number | null;
  /** Solde courant du wallet (pour le champ `balance` de la réponse). */
  balance: PnlBalance;
  startBalanceSol: number;
  endBalanceSol: number;
}

/**
 * Solde du wallet (lamports) dans une tx brute, via `pre/postBalances` indexés sur `accountKeys`.
 * Le wallet (signer / partie de la tx) est toujours dans les clés statiques → l'index est fiable.
 */
function walletBalanceLamports(
  raw: RawTransaction,
  wallet: string,
  which: 'pre' | 'post'
): number | null {
  const keys = (raw.transaction?.message?.accountKeys ?? []).map((k) =>
    typeof k === 'string' ? k : k.pubkey
  );
  const idx = keys.indexOf(wallet);
  if (idx < 0) return null;
  const arr = which === 'pre' ? raw.meta?.preBalances : raw.meta?.postBalances;
  const v = arr?.[idx];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function balanceAt(signature: string, wallet: string, which: 'pre' | 'post'): Promise<number | null> {
  try {
    const raw = await getRawTransaction(signature);
    return walletBalanceLamports(raw, wallet, which);
  } catch {
    return null;
  }
}

/**
 * Somme nette (lamports) des transferts SOL **externes** du wallet dans (fromSec, toSec] :
 * `+` pour les dépôts (SOL reçu), `−` pour les retraits (SOL envoyé). On ne récupère que les
 * transactions de type `TRANSFER` (filtrage côté Helius) — peu nombreuses pour un wallet de
 * trading. Ce net est retranché du delta de solde brut pour ne garder que le trading.
 */
async function sumNetExternalTransferLamports(
  wallet: string,
  fromSec: number,
  toSec: number
): Promise<{ net: number; truncated: boolean }> {
  let before: string | undefined;
  let net = 0;
  let reachedStart = false;
  let exhausted = false;

  for (let page = 0; page < MAX_TRANSFER_PAGES; page += 1) {
    const txs = await getEnhancedTransactionsByAddress(wallet, { type: 'TRANSFER', before });
    if (txs.length === 0) {
      exhausted = true;
      break;
    }
    for (const tx of txs) {
      const ts = tx.timestamp;
      if (typeof ts !== 'number' || ts > toSec || ts <= fromSec) continue;
      for (const nt of tx.nativeTransfers ?? []) {
        if (!(nt.amount > 0)) continue;
        if (nt.toUserAccount === wallet && nt.fromUserAccount !== wallet) net += nt.amount;
        else if (nt.fromUserAccount === wallet && nt.toUserAccount !== wallet) net -= nt.amount;
      }
    }
    const oldest = txs[txs.length - 1];
    if (oldest && typeof oldest.timestamp === 'number' && oldest.timestamp <= fromSec) {
      reachedStart = true;
      break;
    }
    before = oldest?.signature;
    if (!before) {
      exhausted = true;
      break;
    }
  }

  return { net, truncated: !reachedStart && !exhausted };
}

/**
 * PNL d'un wallet par **delta de solde SOL** sur [fromMs, toMs] (méthode on-chain Helius).
 *
 * Principe (aligné « solde de début vs dernière balance connue ») :
 *  - solde de fin = `getBalance` courant si `toMs` ≈ maintenant, sinon le solde après la dernière
 *    tx ≤ toMs ;
 *  - solde de début = le solde après la dernière tx **avant** la fenêtre (sa `postBalance`) ;
 *  - `PNL_sol = (soldeFin − soldeDébut) − transferts SOL externes nets` : on retranche les
 *    dépôts/retraits (type `TRANSFER`) pour ne garder que le trading (swaps + frais). Ainsi le
 *    financement initial d'un wallet récent ne gonfle pas le PNL. Les tokens encore détenus ne
 *    sont PAS valorisés.
 *
 * On ne parse PAS chaque transaction : on pagine les *signatures* (1000/page, peu d'appels) pour
 * localiser les bornes, puis on lit 1–2 tx brutes pour les soldes absolus. Bien plus rapide que de
 * sommer les `nativeBalanceChange` de toute la période (évite les timeouts multi-jours).
 */
export async function computeBalanceDeltaPnl(
  walletAddress: string,
  fromMs: number,
  toMs: number,
  solUsd?: number | null
): Promise<BalanceDeltaPnl> {
  const fromSec = Math.floor(fromMs / 1000);
  const toSec = Math.floor(toMs / 1000);
  const toIsNow = toMs >= Date.now() - NOW_SLACK_MS;
  const warnings: string[] = [];

  // Solde courant + prix SOL (un seul getBalance, réutilisé pour le champ `balance`).
  const currentBalance = await fetchWalletBalance(walletAddress, solUsd ?? null);
  let price = solUsd ?? currentBalance.solUsd ?? null;
  if (price === null) {
    try {
      price = await fetchSolUsdFromHeliusDas();
    } catch {
      price = null;
    }
  }

  // Parcourt les signatures (newest→oldest) pour localiser les bornes de la fenêtre.
  let before: string | undefined;
  let txCount = 0;
  let startBoundarySig: string | null = null; // tx la plus récente AVANT la fenêtre
  let endBoundarySig: string | null = null; // tx la plus récente ≤ toSec (périodes passées)
  let oldestInWindowSig: string | null = null; // fallback start si aucune tx avant la fenêtre
  let reachedStart = false;
  let exhausted = false;

  for (let page = 0; page < MAX_SIG_PAGES; page += 1) {
    const sigs = await getSignaturesForAddress(walletAddress, { limit: SIG_PAGE_LIMIT, before });
    if (sigs.length === 0) {
      exhausted = true;
      break;
    }
    for (const s of sigs) {
      const bt = s.blockTime;
      if (typeof bt !== 'number') continue;
      if (!toIsNow && endBoundarySig === null && bt <= toSec) {
        endBoundarySig = s.signature; // 1ère rencontrée (= plus récente) ≤ toSec
      }
      if (bt > fromSec && bt <= toSec) {
        txCount += 1;
        oldestInWindowSig = s.signature; // descend → finit sur la plus ancienne in-window
      } else if (bt <= fromSec) {
        startBoundarySig = s.signature;
        reachedStart = true;
        break;
      }
    }
    if (reachedStart) break;
    before = sigs[sigs.length - 1]?.signature;
    if (!before) {
      exhausted = true;
      break;
    }
  }

  const sigTruncated = !reachedStart && !exhausted;
  if (price === null) {
    warnings.push('Prix SOL indisponible : PNL USD non calculé.');
  }

  // Solde de fin.
  let endLamports: number;
  if (toIsNow) {
    endLamports = currentBalance.lamports;
  } else if (endBoundarySig) {
    endLamports = (await balanceAt(endBoundarySig, walletAddress, 'post')) ?? currentBalance.lamports;
  } else {
    endLamports = currentBalance.lamports; // fenêtre avant toute activité connue
  }

  // Solde de début : postBalance de la dernière tx avant la fenêtre, sinon preBalance de la
  // première tx in-window (wallet financé pendant la fenêtre), sinon pas de variation.
  let startLamports: number | null = null;
  if (startBoundarySig) {
    startLamports = await balanceAt(startBoundarySig, walletAddress, 'post');
  } else if (oldestInWindowSig) {
    startLamports = await balanceAt(oldestInWindowSig, walletAddress, 'pre');
  }
  if (startLamports === null) {
    startLamports = endLamports; // borne introuvable → delta 0
    if (startBoundarySig || oldestInWindowSig) {
      warnings.push('Solde de début introuvable : delta non calculable précisément.');
    }
  }

  // Delta de solde brut, puis exclusion des dépôts/retraits SOL externes (→ trading uniquement).
  const grossDeltaLamports = endLamports - startLamports;
  const { net: netTransferLamports, truncated: transfersTruncated } =
    await sumNetExternalTransferLamports(walletAddress, fromSec, toSec);
  const deltaSol = (grossDeltaLamports - netTransferLamports) / LAMPORTS_PER_SOL;
  const realizedUsd = price !== null ? deltaSol * price : null;

  const truncated = sigTruncated || transfersTruncated;
  if (truncated) {
    warnings.push('Historique Helius tronqué (pagination plafonnée) : delta potentiellement partiel.');
  }

  const result: PnlResult = {
    realizedUsd,
    realizedSol: deltaSol,
    unrealizedUsd: null,
    boughtUsd: 0,
    soldUsd: 0,
    boughtSol: 0,
    soldSol: 0,
    tradeCount: txCount,
    tokenCount: 0,
    winRatePercent: null,
    perToken: [],
    truncated,
    source: 'balance_delta',
  };

  const balance: PnlBalance = {
    sol: currentBalance.sol,
    lamports: currentBalance.lamports,
    solUsd: price,
    valueUsd: price !== null ? currentBalance.sol * price : null,
  };

  return {
    result,
    warnings,
    solUsd: price,
    balance,
    startBalanceSol: startLamports / LAMPORTS_PER_SOL,
    endBalanceSol: endLamports / LAMPORTS_PER_SOL,
  };
}
