import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';

interface WalletRow {
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

interface PurchaseRow {
  id: string;
  token_address: string;
  token_name: string | null;
  purchased_at: string | null;
  amount_sol: number | null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; analysisId: string; walletAddress: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, analysisId, walletAddress } = await context.params;

  const walletRows = await query<WalletRow>(
    `SELECT bw.id, bw.wallet_address, bw.source,
            bw.tokens_bought, bw.total_tokens, bw.coverage_percent,
            bw.first_buy_at, bw.last_buy_at, bw.active_days,
            bw.consistency, bw.weight, bw.avg_hold_duration_hours,
            bw.funding_depth, bw.funding_chain,
            ma.address AS mother_address
     FROM analysis_buyer_wallets bw
     JOIN wallet_analyses wa ON wa.id = bw.analysis_id
     JOIN ruggers r ON r.id = wa.rugger_id
     LEFT JOIN analysis_mother_addresses ma ON ma.id = bw.mother_address_id
     WHERE bw.analysis_id = $1 AND bw.wallet_address = $2
       AND wa.rugger_id = $3 AND r.user_id = $4`,
    [analysisId, walletAddress, ruggerId, userId]
  );

  const row = walletRows[0];
  if (!row) {
    return NextResponse.json({ error: 'Wallet not found in this analysis' }, { status: 404 });
  }

  const purchaseRows = await query<PurchaseRow>(
    `SELECT bp.id, bp.token_address, bp.token_name, bp.purchased_at, bp.amount_sol
     FROM analysis_buyer_purchases bp
     WHERE bp.buyer_wallet_id = $1
     ORDER BY bp.purchased_at ASC NULLS LAST`,
    [row.id]
  );

  const purchases = purchaseRows.map((p) => ({
    id: p.id,
    tokenAddress: p.token_address,
    tokenName: p.token_name,
    purchasedAt: p.purchased_at,
    amountSol: p.amount_sol,
  }));

  return NextResponse.json({
    id: row.id,
    walletAddress: row.wallet_address,
    source: row.source,
    tokensBought: row.tokens_bought,
    totalTokens: row.total_tokens,
    coveragePercent: row.coverage_percent,
    firstBuyAt: row.first_buy_at,
    lastBuyAt: row.last_buy_at,
    activeDays: row.active_days,
    consistency: row.consistency,
    weight: row.weight,
    avgHoldDuration: row.avg_hold_duration_hours,
    fundingDepth: row.funding_depth,
    fundingChain: row.funding_chain ? JSON.parse(row.funding_chain) : null,
    motherAddress: row.mother_address,
    purchases,
  });
}
