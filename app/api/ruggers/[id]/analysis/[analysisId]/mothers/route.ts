import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';

interface MotherRow {
  id: string;
  address: string;
  wallets_funded: number;
  validated: boolean;
  validated_at: string | null;
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

  const rows = await query<MotherRow>(
    `SELECT id, address, wallets_funded, validated, validated_at
     FROM analysis_mother_addresses
     WHERE analysis_id = $1
     ORDER BY wallets_funded DESC`,
    [analysisId]
  );

  const mothers = rows.map((r) => ({
    id: r.id,
    address: r.address,
    walletsFunded: r.wallets_funded,
    validated: r.validated,
    validatedAt: r.validated_at,
  }));

  return NextResponse.json({ mothers });
}
