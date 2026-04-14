import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
import { findCrossRuggerWallets } from '@/lib/analysis/cross-rugger';

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

  const walletRows = await query<{ wallet_address: string }>(
    'SELECT wallet_address FROM analysis_buyer_wallets WHERE analysis_id = $1',
    [analysisId]
  );
  const addresses = walletRows.map((r) => r.wallet_address);

  const matches = await findCrossRuggerWallets(userId, addresses);

  return NextResponse.json({ matches });
}
