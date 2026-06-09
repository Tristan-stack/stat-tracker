import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok, created } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { listBuyers, insertBuyer } from '@/features/ruggers/buyers-repository';
import { trimToNull } from '@/features/ruggers/normalize';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');

  const buyers = await listBuyers(ruggerId);
  return ok({ buyers });
});

const createSchema = z.object({
  walletAddress: z.string().trim().min(1, 'walletAddress is required'),
  label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  origin: z.enum(['manual', 'watchlist', 'analysis', 'scraping']).optional(),
});

export const POST = withAuth<Ctx>(
  async (req, ctx, { userId }) => {
    const { id: ruggerId } = await ctx.params;
    if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');

    const body = await parseBody(req, createSchema);
    const buyer = await insertBuyer({
      ruggerId,
      walletAddress: body.walletAddress,
      label: trimToNull(body.label),
      notes: trimToNull(body.notes),
      origin: body.origin ?? 'manual',
    });
    return created(buyer);
  },
  {
    name: 'POST /api/ruggers/[id]/buyers',
    dbErrors: { conflict: 'Wallet already linked to this rugger' },
  }
);
