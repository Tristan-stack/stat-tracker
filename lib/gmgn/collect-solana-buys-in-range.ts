import {
  fetchWalletActivityPage,
  type WalletActivityPage,
  type WalletActivityRow,
} from '@/lib/gmgn/client';

const CHAIN_SOL = 'sol';

function envInt(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : def;
}

// Caps abaissés pour rester < 60 s sur Vercel Hobby (throttle GMGN ~650 ms/page).
// Surchargeables par env si retour sur un plan avec fonctions plus longues.
const MAX_ACTIVITY_PAGES = envInt('GMGN_MAX_ACTIVITY_PAGES', 50);
const MAX_ACTIVITY_PAGES_SHORT_RANGE = envInt('GMGN_MAX_ACTIVITY_PAGES_SHORT', 60);
/** Budget temps d'un collect (ms) : on coupe avant le timeout de fonction. */
const COLLECT_BUDGET_MS = envInt('GMGN_COLLECT_BUDGET_MS', 45000);

/**
 * Retourne un timestamp Unix en **secondes**.
 * GMGN renvoie souvent des millisecondes (≈ 1,7e12) ; comparer tel quel à `fromMs/1000` exclut tous les événements.
 */
export function rowTimestampSec(row: WalletActivityRow): number {
  const r = row as WalletActivityRow & { ts?: number; block_time?: number; time?: number };
  const candidates = [r.timestamp, r.ts, r.block_time, r.time];
  for (const t of candidates) {
    if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) continue;
    if (t >= 1_000_000_000_000) return Math.floor(t / 1000);
    return Math.floor(t);
  }
  return 0;
}

export function tokenMint(row: WalletActivityRow): string | null {
  const a = row.token?.address ?? row.token_address;
  if (typeof a === 'string' && a.length > 0) return a;
  return null;
}

function isBuy(row: WalletActivityRow): boolean {
  const et = row.event_type?.toLowerCase();
  if (et === 'buy') return true;
  const side = row.side?.toLowerCase();
  if (side === 'buy') return true;
  return false;
}

function normalizeActivityPage(data: WalletActivityPage): WalletActivityRow[] {
  const d = data as unknown as { activities?: unknown; list?: unknown };
  if (Array.isArray(d.activities)) return d.activities as WalletActivityRow[];
  if (Array.isArray(d.list)) return d.list as WalletActivityRow[];
  return [];
}

/**
 * Collect buy activities in [fromMs, toMs], dedupe by mint (earliest buy in window).
 */
export async function collectSolanaBuysInRange(
  walletAddress: string,
  fromMs: number,
  toMs: number
): Promise<WalletActivityRow[]> {
  const fromSec = Math.floor(fromMs / 1000);
  const toSec = Math.floor(toMs / 1000);
  const spanMs = Math.max(0, toMs - fromMs);
  const maxPages =
    spanMs <= 3 * 86400000 ? MAX_ACTIVITY_PAGES_SHORT_RANGE : MAX_ACTIVITY_PAGES;
  const collected: WalletActivityRow[] = [];
  const deadline = Date.now() + COLLECT_BUDGET_MS;
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    if (Date.now() > deadline) break;
    const data = await fetchWalletActivityPage(CHAIN_SOL, walletAddress, {
      limit: 50,
      cursor,
      types: ['buy'],
    });
    const activities = normalizeActivityPage(data);
    const pageTimestamps = activities
      .map((row) => rowTimestampSec(row))
      .filter((ts) => ts > 0);

    for (const row of activities) {
      if (!isBuy(row)) continue;
      const ts = rowTimestampSec(row);
      if (ts < fromSec || ts > toSec) continue;
      collected.push(row);
    }

    if (pageTimestamps.length > 1) {
      const firstTs = pageTimestamps[0];
      const lastTs = pageTimestamps[pageTimestamps.length - 1];
      const seemsDescending = firstTs >= lastTs;
      const oldestTs = Math.min(...pageTimestamps);

      if (seemsDescending && oldestTs < fromSec) break;
    }

    const next = data.next;
    if (!next || activities.length === 0) break;
    cursor = next;
  }

  const byMint = new Map<string, WalletActivityRow>();
  for (const row of collected) {
    const mint = tokenMint(row);
    if (!mint) continue;
    const ts = rowTimestampSec(row);
    const prev = byMint.get(mint);
    if (!prev || rowTimestampSec(prev) > ts) {
      byMint.set(mint, row);
    }
  }
  return [...byMint.values()].sort((a, b) => rowTimestampSec(a) - rowTimestampSec(b));
}
