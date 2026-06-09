import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { analysisOwnedByUser, listMothers } from '@/features/analysis/repository';

type Ctx = { params: Promise<{ id: string; analysisId: string }> };

export const GET = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId, analysisId } = await ctx.params;
  if (!(await analysisOwnedByUser(analysisId, ruggerId, userId))) throw notFoundError('Analysis not found');

  const mothers = await listMothers(analysisId);
  return ok({ mothers });
});
