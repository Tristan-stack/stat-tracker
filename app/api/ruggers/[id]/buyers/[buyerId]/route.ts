import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { badRequest, notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import {
  buyerExistsForUser,
  updateBuyer,
  deleteBuyer,
  type BuyerUpdate,
} from '@/features/ruggers/buyers-repository';
import { trimToNull } from '@/features/ruggers/normalize';

type Ctx = { params: Promise<{ id: string; buyerId: string }> };

const updateSchema = z.object({
  walletAddress: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  origin: z.enum(['manual', 'watchlist', 'analysis', 'scraping']).optional(),
});

export const PATCH = withAuth<Ctx>(
  async (req, ctx, { userId }) => {
    const { id: ruggerId, buyerId } = await ctx.params;
    if (!(await buyerExistsForUser(buyerId, ruggerId, userId))) {
      throw notFoundError('Buyer wallet not found');
    }

    const body = await parseBody(req, updateSchema);

    const patch: BuyerUpdate = {};
    if (body.walletAddress !== undefined) {
      const next = (body.walletAddress ?? '').trim();
      if (next === '') throw badRequest('walletAddress cannot be empty');
      patch.walletAddress = next;
    }
    if (body.label !== undefined) patch.label = trimToNull(body.label);
    if (body.notes !== undefined) patch.notes = trimToNull(body.notes);
    if (body.origin !== undefined) patch.origin = body.origin;

    const buyer = await updateBuyer(buyerId, ruggerId, patch);
    if (!buyer) throw notFoundError('Buyer wallet not found');
    return ok(buyer);
  },
  {
    name: 'PATCH /api/ruggers/[id]/buyers/[buyerId]',
    dbErrors: { conflict: 'Wallet already linked to this rugger' },
  }
);

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId, buyerId } = await ctx.params;
  if (!(await buyerExistsForUser(buyerId, ruggerId, userId))) {
    throw notFoundError('Buyer wallet not found');
  }
  await deleteBuyer(buyerId, ruggerId);
  return ok({ ok: true });
});
