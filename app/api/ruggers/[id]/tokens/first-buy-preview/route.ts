import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { ApiError, badRequest, notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { getRuggerWalletInfo } from '@/features/ruggers/repository';
import { localGmgnAllTimeRange } from '@/lib/token-date-filter';
import { collectSolanaBuysInRange, rowTimestampSec, tokenMint } from '@/lib/gmgn/wallet-purchases';
import type { WalletActivityRow } from '@/lib/gmgn/client';
import {
  fetchSolUsdFromGmgn,
  mergeNotionalWithSolUsd,
  parseFirstBuyNotional,
} from '@/lib/gmgn/first-buy-notional';
import type { FirstBuyPreviewEntry } from '@/types/first-buy-preview';

type Ctx = { params: Promise<{ id: string }> };

/** Une seule passe GMGN `wallet_activity` : on peut demander beaucoup de mints d'un coup. */
const MAX_MINTS = 8000;

function normalizeMintList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const m = x.trim();
    if (m === '' || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= MAX_MINTS) break;
  }
  return out;
}

export const POST = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;

  const body = await parseBody(req, z.object({ tokenAddresses: z.array(z.unknown()).optional() }));
  const tokenAddresses = normalizeMintList(body.tokenAddresses);
  if (tokenAddresses.length === 0) {
    throw badRequest('tokenAddresses must be a non-empty array of strings');
  }

  const info = await getRuggerWalletInfo(ruggerId, userId);
  if (!info) throw notFoundError('Rugger not found');
  if (info.walletType !== 'buyer') throw badRequest('Rugger wallet type must be buyer');

  const wallet = info.walletAddress?.trim() ?? '';
  if (wallet === '') {
    return ok({
      byMint: {} as Record<string, FirstBuyPreviewEntry>,
      solUsd: null as number | null,
      message: 'Adresse wallet acheteur manquante',
    });
  }

  const { fromMs, toMs } = localGmgnAllTimeRange();
  let solUsd: number | null = null;
  try {
    solUsd = await fetchSolUsdFromGmgn();
  } catch {
    solUsd = null;
  }

  let activityRows: WalletActivityRow[];
  try {
    activityRows = await collectSolanaBuysInRange(wallet, fromMs, toMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'GMGN failed';
    throw new ApiError(502, msg.slice(0, 240));
  }

  const buyByMint = new Map<string, WalletActivityRow>();
  for (const row of activityRows) {
    const m = tokenMint(row);
    if (m) buyByMint.set(m.trim(), row);
  }

  const byMint: Record<string, FirstBuyPreviewEntry> = {};
  for (const mint of tokenAddresses) {
    const row = buyByMint.get(mint);
    if (!row) {
      byMint[mint] = { usd: null, sol: null, purchasedAt: null, error: 'Aucun achat sur la fenêtre GMGN (~366 j)' };
      continue;
    }
    const merged = mergeNotionalWithSolUsd(parseFirstBuyNotional(row), solUsd);
    const ts = rowTimestampSec(row);
    byMint[mint] = {
      usd: merged.usd,
      sol: merged.sol,
      purchasedAt: ts > 0 ? new Date(ts * 1000).toISOString() : null,
    };
  }

  return ok({ byMint, solUsd });
});
