import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { getPostgresErrorCode } from '@/lib/pg-errors';
import type { RuggerBuyerOrigin, RuggerBuyerWallet } from '@/types/rugger-buyer';

const VALID_ORIGINS: RuggerBuyerOrigin[] = ['manual', 'watchlist', 'analysis', 'scraping'];

interface RuggerBuyerRow {
  id: string;
  rugger_id: string;
  wallet_address: string;
  label: string | null;
  notes: string | null;
  origin: RuggerBuyerOrigin;
  created_at: string;
  updated_at: string;
}

function toBuyer(row: RuggerBuyerRow): RuggerBuyerWallet {
  return {
    id: row.id,
    ruggerId: row.rugger_id,
    walletAddress: row.wallet_address,
    label: row.label,
    notes: row.notes,
    origin: row.origin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const rows = await query<RuggerBuyerRow>(
    `SELECT id, rugger_id, wallet_address, label, notes, origin, created_at, updated_at
     FROM rugger_buyer_wallets
     WHERE rugger_id = $1
     ORDER BY created_at DESC`,
    [ruggerId]
  );

  return NextResponse.json({ buyers: rows.map(toBuyer) });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const body = (await req.json()) as {
    walletAddress?: string;
    label?: string | null;
    notes?: string | null;
    origin?: RuggerBuyerOrigin;
  };

  const walletAddress = body.walletAddress?.trim() ?? '';
  if (walletAddress === '') {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }
  const origin = body.origin ?? 'manual';
  if (!VALID_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 400 });
  }

  try {
    const rows = await query<RuggerBuyerRow>(
      `INSERT INTO rugger_buyer_wallets (id, rugger_id, wallet_address, label, notes, origin)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       RETURNING id, rugger_id, wallet_address, label, notes, origin, created_at, updated_at`,
      [ruggerId, walletAddress, body.label?.trim() || null, body.notes?.trim() || null, origin]
    );
    return NextResponse.json(toBuyer(rows[0]), { status: 201 });
  } catch (error) {
    const code = getPostgresErrorCode(error);
    if (code === '23505') {
      return NextResponse.json({ error: 'Wallet already linked to this rugger' }, { status: 409 });
    }
    throw error;
  }
}
