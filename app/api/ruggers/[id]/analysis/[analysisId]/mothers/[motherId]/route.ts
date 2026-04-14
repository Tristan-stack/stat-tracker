import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; analysisId: string; motherId: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, analysisId, motherId } = await context.params;

  const ownership = await query<{ id: string }>(
    `SELECT wa.id FROM wallet_analyses wa
     JOIN ruggers r ON r.id = wa.rugger_id
     WHERE wa.id = $1 AND wa.rugger_id = $2 AND r.user_id = $3`,
    [analysisId, ruggerId, userId]
  );
  if (ownership.length === 0) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  const body = (await req.json()) as { validated: boolean };
  if (typeof body.validated !== 'boolean') {
    return NextResponse.json({ error: 'validated must be a boolean' }, { status: 400 });
  }

  const rows = await query<{ id: string; address: string; wallets_funded: number; validated: boolean; validated_at: string | null }>(
    `UPDATE analysis_mother_addresses
     SET validated = $2, validated_at = CASE WHEN $2 THEN NOW() ELSE NULL END
     WHERE id = $1 AND analysis_id = $3
     RETURNING id, address, wallets_funded, validated, validated_at`,
    [motherId, body.validated, analysisId]
  );

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: 'Mother address not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    address: row.address,
    walletsFunded: row.wallets_funded,
    validated: row.validated,
    validatedAt: row.validated_at,
  });
}
