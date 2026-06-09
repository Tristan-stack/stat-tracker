import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { getBuyerWalletDetail } from '@/features/analysis/repository';

type Ctx = { params: Promise<{ id: string; analysisId: string; walletAddress: string }> };

export const GET = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId, analysisId, walletAddress } = await ctx.params;
  const detail = await getBuyerWalletDetail(analysisId, walletAddress, ruggerId, userId);
  if (!detail) throw notFoundError('Wallet not found in this analysis');
  return ok(detail);
});
