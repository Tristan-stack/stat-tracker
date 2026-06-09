import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { analysisOwnedByUser, getBuyerWalletTokenPairs } from '@/features/analysis/repository';
import { solveCombinations } from '@/lib/analysis/combinations';

type Ctx = { params: Promise<{ id: string; analysisId: string }> };

export const GET = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId, analysisId } = await ctx.params;
  if (!(await analysisOwnedByUser(analysisId, ruggerId, userId))) throw notFoundError('Analysis not found');

  const targetCoverage = Number(new URL(req.url).searchParams.get('targetCoverage') ?? '100');

  const pairs = await getBuyerWalletTokenPairs(analysisId);
  const walletTokens = new Map<string, Set<string>>();
  const allTokens = new Set<string>();
  for (const { walletAddress, tokenAddress } of pairs) {
    allTokens.add(tokenAddress);
    const existing = walletTokens.get(walletAddress);
    if (existing) existing.add(tokenAddress);
    else walletTokens.set(walletAddress, new Set([tokenAddress]));
  }

  const walletSets = Array.from(walletTokens.entries()).map(([walletAddress, tokens]) => ({ walletAddress, tokens }));
  const steps = solveCombinations(walletSets, Array.from(allTokens), { targetCoveragePercent: targetCoverage });

  return ok({ steps, totalTokens: allTokens.size });
});
