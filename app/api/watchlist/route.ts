import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok, created } from '@/lib/api/responses';
import { conflictError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import {
  listWatchlist,
  findWatchlistIdByAddress,
  insertWatchlist,
} from '@/features/watchlist/repository';
import { syncWatchlistToHeliusAsync } from '@/lib/helius/webhooks';

export const GET = withAuth(async (_req, _ctx, { userId }) => {
  const wallets = await listWatchlist(userId);
  return ok({ wallets });
});

const createSchema = z.object({
  walletAddress: z.string().trim().min(1, 'walletAddress is required'),
  label: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  sourceRuggerId: z.string().optional(),
});

export const POST = withAuth(
  async (req, _ctx, { userId }) => {
    const body = await parseBody(req, createSchema);

    const existing = await findWatchlistIdByAddress(userId, body.walletAddress);
    if (existing) throw conflictError('Wallet already in watchlist');

    const wallet = await insertWatchlist({
      userId,
      walletAddress: body.walletAddress,
      label: body.label || null,
      notes: body.notes || null,
      sourceRuggerId: body.sourceRuggerId || null,
    });

    syncWatchlistToHeliusAsync();
    return created(wallet);
  },
  { name: 'POST /api/watchlist' }
);
