import type { BestBuyPerMint } from '@/lib/gmgn/merge-best-buy-per-mint';

export interface MintEntryRow {
  walletAddress: string;
  entryPrice: number;
  purchasedAt: string;
}

export interface MintBreakdown {
  mint: string;
  tokenName: string | null;
  winnerWallet: string;
  entries: MintEntryRow[];
}

export interface WalletComparisonScore {
  walletAddress: string;
  wins: number;
  commonMintCount: number;
  winRatePercent: number;
  /** Sum of entryPrice on mints this wallet won (lower is better tie-break). */
  sumWinnerEntryPrices: number;
}

export interface BestEntryOnCommonMintsResult {
  commonMintCount: number;
  /** Mints distincts présents sur au moins un wallet comparé (réunion). */
  distinctMintUnionCount: number;
  /** Wallets tied for most wins on common mints, after secondary tie-break (lower sumWinnerEntryPrices). */
  globalWinnerWallets: string[];
  scores: WalletComparisonScore[];
  perMint: MintBreakdown[];
}

function compareEntryRows(a: MintEntryRow, b: MintEntryRow): number {
  if (a.entryPrice !== b.entryPrice) return a.entryPrice - b.entryPrice;
  const ta = new Date(a.purchasedAt).getTime();
  const tb = new Date(b.purchasedAt).getTime();
  if (ta !== tb) return ta - tb;
  return a.walletAddress.localeCompare(b.walletAddress);
}

function pickWinner(entries: MintEntryRow[]): string {
  const sorted = [...entries].sort(compareEntryRows);
  return sorted[0]!.walletAddress;
}

function mintIntersection(
  orderedWallets: string[],
  walletMaps: Map<string, Map<string, BestBuyPerMint>>
): string[] {
  if (orderedWallets.length === 0) return [];
  const first = orderedWallets[0];
  const firstMap = walletMaps.get(first);
  if (!firstMap || firstMap.size === 0) return [];

  const common: string[] = [];
  for (const mint of firstMap.keys()) {
    let allHave = true;
    for (let i = 1; i < orderedWallets.length; i += 1) {
      const m = walletMaps.get(orderedWallets[i]!);
      if (!m?.has(mint)) {
        allHave = false;
        break;
      }
    }
    if (allHave) common.push(mint);
  }
  return common.sort((a, b) => a.localeCompare(b));
}

function distinctMintUnionCount(
  orderedWallets: string[],
  walletMaps: Map<string, Map<string, BestBuyPerMint>>
): number {
  const union = new Set<string>();
  for (const w of orderedWallets) {
    const m = walletMaps.get(w);
    if (!m) continue;
    for (const mint of m.keys()) union.add(mint);
  }
  return union.size;
}

/**
 * @param orderedWallets stable order used for deterministic tie-breaks
 * @param walletMaps best buy per mint per wallet (only wallets in orderedWallets need entries)
 */
export function computeBestEntryOnCommonMints(
  orderedWallets: string[],
  walletMaps: Map<string, Map<string, BestBuyPerMint>>
): BestEntryOnCommonMintsResult {
  if (orderedWallets.length < 2) {
    return {
      commonMintCount: 0,
      distinctMintUnionCount: distinctMintUnionCount(orderedWallets, walletMaps),
      globalWinnerWallets: [],
      scores: orderedWallets.map((walletAddress) => ({
        walletAddress,
        wins: 0,
        commonMintCount: 0,
        winRatePercent: 0,
        sumWinnerEntryPrices: 0,
      })),
      perMint: [],
    };
  }

  const commonMints = mintIntersection(orderedWallets, walletMaps);
  const n = commonMints.length;
  const wins = new Map<string, number>();
  for (const w of orderedWallets) {
    wins.set(w, 0);
  }

  const perMint: MintBreakdown[] = [];

  for (const mint of commonMints) {
    const entries: MintEntryRow[] = [];
    let tokenName: string | null = null;
    for (const walletAddress of orderedWallets) {
      const row = walletMaps.get(walletAddress)?.get(mint);
      if (!row) continue;
      entries.push({
        walletAddress,
        entryPrice: row.entryPrice,
        purchasedAt: row.purchasedAt,
      });
      if (!tokenName && row.tokenName) tokenName = row.tokenName;
    }
    const winnerWallet = pickWinner(entries);
    wins.set(winnerWallet, (wins.get(winnerWallet) ?? 0) + 1);
    const entriesBestToWorst = [...entries].sort(compareEntryRows);
    perMint.push({ mint, tokenName, winnerWallet, entries: entriesBestToWorst });
  }

  const scores: WalletComparisonScore[] = orderedWallets.map((walletAddress) => {
    const w = wins.get(walletAddress) ?? 0;
    let sumWinnerEntryPrices = 0;
    for (const row of perMint) {
      if (row.winnerWallet === walletAddress) {
        const self = row.entries.find((e) => e.walletAddress === walletAddress);
        if (self) sumWinnerEntryPrices += self.entryPrice;
      }
    }
    return {
      walletAddress,
      wins: w,
      commonMintCount: n,
      winRatePercent: n > 0 ? (w / n) * 100 : 0,
      sumWinnerEntryPrices,
    };
  });

  let globalWinnerWallets: string[] = [];
  if (n > 0) {
    const maxWins = Math.max(...scores.map((s) => s.wins));
    const tiedByWins = scores.filter((s) => s.wins === maxWins);
    const minSum = Math.min(...tiedByWins.map((s) => s.sumWinnerEntryPrices));
    globalWinnerWallets = tiedByWins
      .filter((s) => s.sumWinnerEntryPrices === minSum)
      .map((s) => s.walletAddress)
      .sort((a, b) => a.localeCompare(b));
  }

  scores.sort(
    (a, b) =>
      b.wins - a.wins ||
      a.sumWinnerEntryPrices - b.sumWinnerEntryPrices ||
      a.walletAddress.localeCompare(b.walletAddress)
  );

  return {
    commonMintCount: n,
    distinctMintUnionCount: distinctMintUnionCount(orderedWallets, walletMaps),
    globalWinnerWallets,
    scores,
    perMint,
  };
}
