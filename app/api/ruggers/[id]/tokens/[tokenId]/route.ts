import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { updateRuggerToken, deleteToken } from '@/features/ruggers/tokens-repository';

type Ctx = { params: Promise<{ id: string; tokenId: string }> };

const patchSchema = z.object({
  targetExitPercent: z.number().optional(),
  entryPrice: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  purchasedAt: z.union([z.string(), z.null()]).optional(),
  tokenAddress: z.union([z.string(), z.null()]).optional(),
  name: z.string().optional(),
  tokenName: z.union([z.string(), z.null()]).optional(),
  entryToLowMinutes: z.union([z.number(), z.null()]).optional(),
});

export const PATCH = withAuth<Ctx>(
  async (req, ctx, { userId }) => {
    const { id: ruggerId, tokenId } = await ctx.params;
    if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');

    const patch = await parseBody(req, patchSchema);
    const { updated, warning } = await updateRuggerToken(ruggerId, tokenId, patch);
    if (!updated) throw notFoundError('Token not found');

    return ok(warning ? { ok: true, warning } : { ok: true });
  },
  { name: 'PATCH /api/ruggers/[id]/tokens/[tokenId]' }
);

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId, tokenId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');
  await deleteToken(ruggerId, tokenId);
  return ok({ ok: true });
});
