import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
import { syncWatchlistToHeliusAsync } from '@/lib/helius/webhooks';

interface WatchlistRow {
  id: string;
  wallet_address: string;
  label: string | null;
  notes: string | null;
  source_rugger_id: string | null;
  rugger_name: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const rows = await query<WatchlistRow>(
    `SELECT w.id, w.wallet_address, w.label, w.notes, w.source_rugger_id,
            r.name AS rugger_name, w.created_at
     FROM watchlist_wallets w
     LEFT JOIN ruggers r ON r.id = w.source_rugger_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId]
  );

  const wallets = rows.map((r) => ({
    id: r.id,
    walletAddress: r.wallet_address,
    label: r.label,
    notes: r.notes,
    sourceRuggerId: r.source_rugger_id,
    sourceRuggerName: r.rugger_name,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ wallets });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const body = (await req.json()) as {
    walletAddress?: string;
    label?: string;
    notes?: string;
    sourceRuggerId?: string;
  };

  const walletAddress = body.walletAddress?.trim();
  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  const existing = await query<{ id: string }>(
    'SELECT id FROM watchlist_wallets WHERE user_id = $1 AND wallet_address = $2',
    [userId, walletAddress]
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: 'Wallet already in watchlist' }, { status: 409 });
  }

  const rows = await query<{ id: string; wallet_address: string; label: string | null; notes: string | null; source_rugger_id: string | null; created_at: string }>(
    `INSERT INTO watchlist_wallets (id, user_id, wallet_address, label, notes, source_rugger_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
     RETURNING id, wallet_address, label, notes, source_rugger_id, created_at`,
    [userId, walletAddress, body.label?.trim() || null, body.notes?.trim() || null, body.sourceRuggerId || null]
  );

  const r = rows[0];

  syncWatchlistToHeliusAsync();

  return NextResponse.json({
    id: r.id,
    walletAddress: r.wallet_address,
    label: r.label,
    notes: r.notes,
    sourceRuggerId: r.source_rugger_id,
    sourceRuggerName: null,
    createdAt: r.created_at,
  }, { status: 201 });
}
