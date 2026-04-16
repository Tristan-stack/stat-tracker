import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
import { syncWatchlistToHeliusAsync } from '@/lib/helius/webhooks';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id } = await context.params;

  const body = (await req.json()) as {
    label?: string;
    notes?: string;
  };

  const rows = await query<{
    id: string;
    wallet_address: string;
    label: string | null;
    notes: string | null;
    source_rugger_id: string | null;
    created_at: string;
  }>(
    `UPDATE watchlist_wallets
     SET label = COALESCE($3, label),
         notes = COALESCE($4, notes)
     WHERE id = $1 AND user_id = $2
     RETURNING id, wallet_address, label, notes, source_rugger_id, created_at`,
    [id, userId, body.label?.trim() ?? null, body.notes?.trim() ?? null]
  );

  const r = rows[0];
  if (!r) {
    return NextResponse.json({ error: 'Watchlist entry not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: r.id,
    walletAddress: r.wallet_address,
    label: r.label,
    notes: r.notes,
    sourceRuggerId: r.source_rugger_id,
    sourceRuggerName: null,
    createdAt: r.created_at,
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id } = await context.params;

  const rows = await query<{ id: string }>(
    'DELETE FROM watchlist_wallets WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Watchlist entry not found' }, { status: 404 });
  }

  syncWatchlistToHeliusAsync();

  return NextResponse.json({ deleted: true });
}
