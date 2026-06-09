import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { updateWatchlist, deleteWatchlist } from '@/features/watchlist/repository';
import { syncWatchlistToHeliusAsync } from '@/lib/helius/webhooks';

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const PATCH = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, updateSchema);

  const wallet = await updateWatchlist({
    id,
    userId,
    label: body.label != null ? body.label.trim() : null,
    notes: body.notes != null ? body.notes.trim() : null,
  });
  if (!wallet) throw notFoundError('Watchlist entry not found');

  return ok(wallet);
});

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id } = await ctx.params;

  const deleted = await deleteWatchlist(id, userId);
  if (!deleted) throw notFoundError('Watchlist entry not found');

  syncWatchlistToHeliusAsync();
  return ok({ deleted: true });
});
