import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
import { solveCombinations } from '@/lib/analysis/combinations';

interface BuyerPurchaseRow {
  wallet_address: string;
  token_address: string;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; analysisId: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, analysisId } = await context.params;

  const ownership = await query<{ id: string }>(
    `SELECT wa.id FROM wallet_analyses wa
     JOIN ruggers r ON r.id = wa.rugger_id
     WHERE wa.id = $1 AND wa.rugger_id = $2 AND r.user_id = $3`,
    [analysisId, ruggerId, userId]
  );
  if (ownership.length === 0) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  const url = new URL(req.url);
  const targetCoverage = Number(url.searchParams.get('targetCoverage') ?? '100');

  const rows = await query<BuyerPurchaseRow>(
    `SELECT bw.wallet_address, bp.token_address
     FROM analysis_buyer_wallets bw
     JOIN analysis_buyer_purchases bp ON bp.buyer_wallet_id = bw.id
     WHERE bw.analysis_id = $1`,
    [analysisId]
  );

  const walletTokens = new Map<string, Set<string>>();
  const allTokens = new Set<string>();

  for (const row of rows) {
    allTokens.add(row.token_address);
    const existing = walletTokens.get(row.wallet_address);
    if (existing) {
      existing.add(row.token_address);
    } else {
      walletTokens.set(row.wallet_address, new Set([row.token_address]));
    }
  }

  const walletSets = Array.from(walletTokens.entries()).map(([walletAddress, tokens]) => ({
    walletAddress,
    tokens,
  }));

  const steps = solveCombinations(walletSets, Array.from(allTokens), {
    targetCoveragePercent: targetCoverage,
  });

  return NextResponse.json({ steps, totalTokens: allTokens.size });
}
