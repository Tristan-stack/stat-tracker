import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
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

async function buyerExistsForUser(buyerId: string, ruggerId: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT rbw.id
     FROM rugger_buyer_wallets rbw
     JOIN ruggers r ON r.id = rbw.rugger_id
     WHERE rbw.id = $1 AND rbw.rugger_id = $2 AND r.user_id = $3`,
    [buyerId, ruggerId, userId]
  );
  return rows.length > 0;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; buyerId: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, buyerId } = await context.params;
  if (!(await buyerExistsForUser(buyerId, ruggerId, userId))) {
    return NextResponse.json({ error: 'Buyer wallet not found' }, { status: 404 });
  }

  const body = (await req.json()) as {
    walletAddress?: string | null;
    label?: string | null;
    notes?: string | null;
    origin?: RuggerBuyerOrigin;
  };

  const updates: string[] = [];
  const values: (string | null)[] = [];
  let paramIndex = 1;

  if (body.walletAddress !== undefined) {
    const nextAddress = body.walletAddress?.trim() ?? '';
    if (nextAddress === '') {
      return NextResponse.json({ error: 'walletAddress cannot be empty' }, { status: 400 });
    }
    updates.push(`wallet_address = $${paramIndex++}`);
    values.push(nextAddress);
  }
  if (body.label !== undefined) {
    updates.push(`label = $${paramIndex++}`);
    values.push(body.label?.trim() || null);
  }
  if (body.notes !== undefined) {
    updates.push(`notes = $${paramIndex++}`);
    values.push(body.notes?.trim() || null);
  }
  if (body.origin !== undefined) {
    if (!VALID_ORIGINS.includes(body.origin)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 400 });
    }
    updates.push(`origin = $${paramIndex++}`);
    values.push(body.origin);
  }

  if (updates.length === 0) {
    const rows = await query<RuggerBuyerRow>(
      `SELECT id, rugger_id, wallet_address, label, notes, origin, created_at, updated_at
       FROM rugger_buyer_wallets
       WHERE id = $1 AND rugger_id = $2`,
      [buyerId, ruggerId]
    );
    return NextResponse.json(toBuyer(rows[0]));
  }

  updates.push('updated_at = now()');
  values.push(buyerId, ruggerId);
  try {
    const rows = await query<RuggerBuyerRow>(
      `UPDATE rugger_buyer_wallets
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND rugger_id = $${paramIndex}
       RETURNING id, rugger_id, wallet_address, label, notes, origin, created_at, updated_at`,
      values
    );
    return NextResponse.json(toBuyer(rows[0]));
  } catch (error) {
    const code = getPostgresErrorCode(error);
    if (code === '23505') {
      return NextResponse.json({ error: 'Wallet already linked to this rugger' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; buyerId: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, buyerId } = await context.params;
  if (!(await buyerExistsForUser(buyerId, ruggerId, userId))) {
    return NextResponse.json({ error: 'Buyer wallet not found' }, { status: 404 });
  }

  await query('DELETE FROM rugger_buyer_wallets WHERE id = $1 AND rugger_id = $2', [buyerId, ruggerId]);
  return NextResponse.json({ ok: true });
}
