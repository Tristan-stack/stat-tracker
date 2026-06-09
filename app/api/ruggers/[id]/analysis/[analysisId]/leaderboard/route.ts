import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { analysisOwnedByUser, listBuyerWallets } from '@/features/analysis/repository';

type Ctx = { params: Promise<{ id: string; analysisId: string }> };

export const GET = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId, analysisId } = await ctx.params;
  if (!(await analysisOwnedByUser(analysisId, ruggerId, userId))) throw notFoundError('Analysis not found');

  const url = new URL(req.url);
  const sortBy = url.searchParams.get('sortBy') ?? 'coverage';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
  const offset = Number(url.searchParams.get('offset') ?? '0');
  const search = url.searchParams.get('search')?.trim() ?? '';
  const sortParam = url.searchParams.get('sort')?.trim() ?? '';

  const { wallets, total } = await listBuyerWallets({ analysisId, sortParam, sortBy, search, limit, offset });
  return ok({ wallets, total, limit, offset });
});
