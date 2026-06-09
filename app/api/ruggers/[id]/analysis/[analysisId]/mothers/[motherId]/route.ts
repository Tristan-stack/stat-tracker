import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { analysisOwnedByUser, updateMotherValidation } from '@/features/analysis/repository';

type Ctx = { params: Promise<{ id: string; analysisId: string; motherId: string }> };

export const PATCH = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId, analysisId, motherId } = await ctx.params;
  if (!(await analysisOwnedByUser(analysisId, ruggerId, userId))) throw notFoundError('Analysis not found');

  const body = await parseBody(req, z.object({ validated: z.boolean() }));
  const mother = await updateMotherValidation(motherId, analysisId, body.validated);
  if (!mother) throw notFoundError('Mother address not found');

  return ok(mother);
});
