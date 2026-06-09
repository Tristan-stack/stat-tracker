import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { getAnalysisForUser, deleteAnalysisForUser } from '@/features/analysis/repository';

type Ctx = { params: Promise<{ id: string; analysisId: string }> };

export const GET = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId, analysisId } = await ctx.params;
  const analysis = await getAnalysisForUser(analysisId, ruggerId, userId);
  if (!analysis) throw notFoundError('Analysis not found');
  return ok(analysis);
});

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId, analysisId } = await ctx.params;
  const deleted = await deleteAnalysisForUser(analysisId, ruggerId, userId);
  if (!deleted) throw notFoundError('Analysis not found');
  return ok({ ok: true });
});
