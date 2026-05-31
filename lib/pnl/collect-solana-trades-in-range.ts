import { fetchWalletActivityPage, type WalletActivityPage, type WalletActivityRow } from '@/lib/gmgn/client';
import { rowTimestampSec, tokenMint } from '@/lib/gmgn/collect-solana-buys-in-range';
import {
  mergeNotionalWithSolUsd,
  parseFirstBuyNotional,
} from '@/lib/gmgn/first-buy-notional';

const CHAIN_SOL = 'sol';
const MAX_ACTIVITY_PAGES = 80;
const MAX_ACTIVITY_PAGES_SHORT_RANGE = 250;

export type TradeSide = 'buy' | 'sell';

export interface PnlTradeRow {
  mint: string;
  side: TradeSide;
  tsSec: number;
  usd: number | null;
  sol: number | null;
  /** Frais du trade (dex + gas) en USD / SOL, à déduire du PNL réalisé. */
  feeUsd: number;
  feeSol: number;
  tokenName: string | null;
}

function parsePositive(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** Somme les frais USD (dex + gas) et SOL (dex + gas + priority + tip) d'une ligne d'activité. */
function tradeFees(row: WalletActivityRow): { usd: number; sol: number } {
  const r = row as WalletActivityRow & Record<string, unknown>;
  const usd = parsePositive(r.dex_usd) + parsePositive(r.gas_usd);
  const sol =
    parsePositive(r.dex_native) +
    parsePositive(r.gas_native) +
    parsePositive(r.priority_fee) +
    parsePositive(r.tip_fee);
  return { usd, sol };
}

function classifySide(row: WalletActivityRow): TradeSide | null {
  const et = row.event_type?.toLowerCase();
  if (et === 'buy' || et === 'sell') return et;
  const side = row.side?.toLowerCase();
  if (side === 'buy' || side === 'sell') return side;
  return null;
}

function tokenName(row: WalletActivityRow): string | null {
  const n = row.token?.name?.trim();
  if (n) return n;
  const sym = row.token?.symbol?.trim();
  if (sym) return sym;
  return null;
}

function normalizeActivityPage(data: WalletActivityPage): WalletActivityRow[] {
  const d = data as unknown as { activities?: unknown; list?: unknown };
  if (Array.isArray(d.activities)) return d.activities as WalletActivityRow[];
  if (Array.isArray(d.list)) return d.list as WalletActivityRow[];
  return [];
}

/**
 * Collecte les achats ET ventes d'un wallet dans [fromMs, toMs] (sans dédup),
 * avec notional USD/SOL extrait par ligne. `truncated` = la pagination a atteint sa
 * limite avant d'atteindre le début de la fenêtre (résultats potentiellement partiels).
 *
 * @param solUsd spot SOL/USD pour compléter le notional manquant ; passer le résultat
 *               d'un seul `fetchSolUsdFromGmgn()` pour éviter des appels répétés.
 */
export async function collectSolanaTradesInRange(
  walletAddress: string,
  fromMs: number,
  toMs: number,
  solUsd: number | null
): Promise<{ rows: PnlTradeRow[]; truncated: boolean }> {
  const fromSec = Math.floor(fromMs / 1000);
  const toSec = Math.floor(toMs / 1000);
  const spanMs = Math.max(0, toMs - fromMs);
  const maxPages = spanMs <= 3 * 86400000 ? MAX_ACTIVITY_PAGES_SHORT_RANGE : MAX_ACTIVITY_PAGES;

  const rows: PnlTradeRow[] = [];
  let cursor: string | undefined;
  let reachedWindowStart = false;
  let exhausted = false;

  for (let page = 0; page < maxPages; page += 1) {
    const data = await fetchWalletActivityPage(CHAIN_SOL, walletAddress, {
      limit: 50,
      cursor,
      types: ['buy', 'sell'],
    });
    const activities = normalizeActivityPage(data);
    const pageTimestamps = activities.map((row) => rowTimestampSec(row)).filter((ts) => ts > 0);

    for (const row of activities) {
      const side = classifySide(row);
      if (!side) continue;
      const mint = tokenMint(row);
      if (!mint) continue;
      const tsSec = rowTimestampSec(row);
      if (tsSec < fromSec || tsSec > toSec) continue;
      const merged = mergeNotionalWithSolUsd(parseFirstBuyNotional(row), solUsd);
      const fees = tradeFees(row);
      rows.push({
        mint,
        side,
        tsSec,
        usd: merged.usd,
        sol: merged.sol,
        feeUsd: fees.usd,
        feeSol: fees.sol,
        tokenName: tokenName(row),
      });
    }

    // Pages descendantes : si la plus ancienne ligne est avant le début de fenêtre,
    // on a tout couvert → on peut s'arrêter sans tronquer.
    if (pageTimestamps.length > 0) {
      const oldestTs = Math.min(...pageTimestamps);
      if (oldestTs < fromSec) {
        reachedWindowStart = true;
        break;
      }
    }

    const next = data.next;
    if (!next || activities.length === 0) {
      exhausted = true;
      break;
    }
    cursor = next;
  }

  const truncated = !reachedWindowStart && !exhausted;
  return { rows, truncated };
}
