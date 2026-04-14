import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';

interface BuyerWalletRow {
  id: string;
  wallet_address: string;
  source: string;
  tokens_bought: number;
  total_tokens: number;
  coverage_percent: number;
  first_buy_at: string | null;
  last_buy_at: string | null;
  active_days: number;
  consistency: number;
  weight: number;
  avg_hold_duration_hours: number | null;
  funding_depth: number | null;
  funding_chain: string | null;
  mother_address: string | null;
}

const VALID_SORT_FIELDS: Record<string, string> = {
  consistency: 'bw.consistency',
  weight: 'bw.weight',
  coverage: 'bw.coverage_percent',
  tokensBought: 'bw.tokens_bought',
};

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
  const sortBy = url.searchParams.get('sortBy') ?? 'consistency';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
  const offset = Number(url.searchParams.get('offset') ?? '0');

  const orderColumn = VALID_SORT_FIELDS[sortBy] ?? 'bw.consistency';

  const rows = await query<BuyerWalletRow>(
    `SELECT bw.id, bw.wallet_address, bw.source,
            bw.tokens_bought, bw.total_tokens, bw.coverage_percent,
            bw.first_buy_at, bw.last_buy_at, bw.active_days,
            bw.consistency, bw.weight, bw.avg_hold_duration_hours,
            bw.funding_depth, bw.funding_chain,
            ma.address AS mother_address
     FROM analysis_buyer_wallets bw
     LEFT JOIN analysis_mother_addresses ma ON ma.id = bw.mother_address_id
     WHERE bw.analysis_id = $1
     ORDER BY ${orderColumn} DESC
     LIMIT $2 OFFSET $3`,
    [analysisId, limit, offset]
  );

  const countRows = await query<{ total: string }>(
    'SELECT count(*) AS total FROM analysis_buyer_wallets WHERE analysis_id = $1',
    [analysisId]
  );
  const total = Number(countRows[0]?.total ?? 0);

  const wallets = rows.map((r) => ({
    id: r.id,
    walletAddress: r.wallet_address,
    source: r.source,
    tokensBought: r.tokens_bought,
    totalTokens: r.total_tokens,
    coveragePercent: r.coverage_percent,
    firstBuyAt: r.first_buy_at,
    lastBuyAt: r.last_buy_at,
    activeDays: r.active_days,
    consistency: r.consistency,
    weight: r.weight,
    avgHoldDuration: r.avg_hold_duration_hours,
    fundingDepth: r.funding_depth,
    fundingChain: r.funding_chain ? JSON.parse(r.funding_chain) : null,
    motherAddress: r.mother_address,
  }));

  return NextResponse.json({ wallets, total, limit, offset });
}
