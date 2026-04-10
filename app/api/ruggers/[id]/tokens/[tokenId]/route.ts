import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-session';
import { ruggerExistsForUser } from '@/lib/rugger-access';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; tokenId: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, tokenId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const body = (await req.json()) as {
    targetExitPercent?: number;
    entryPrice?: number;
    high?: number;
    low?: number;
    purchasedAt?: string | null;
    tokenAddress?: string | null;
    /** Mint / identifiant canonique. */
    name?: string;
    tokenName?: string | null;
  };

  const setClauses: string[] = [];
  const values: (number | string | null)[] = [];
  let paramIndex = 1;

  if (body.targetExitPercent !== undefined) {
    if (typeof body.targetExitPercent !== 'number' || !Number.isFinite(body.targetExitPercent)) {
      return NextResponse.json({ error: 'targetExitPercent must be a number' }, { status: 400 });
    }
    setClauses.push(`target_exit_percent = $${paramIndex++}`);
    values.push(body.targetExitPercent);
  }

  if (body.entryPrice !== undefined) {
    if (typeof body.entryPrice !== 'number' || !Number.isFinite(body.entryPrice) || body.entryPrice < 0) {
      return NextResponse.json({ error: 'entryPrice must be a non-negative number' }, { status: 400 });
    }
    setClauses.push(`entry_price = $${paramIndex++}`);
    values.push(body.entryPrice);
  }

  if (body.high !== undefined) {
    if (typeof body.high !== 'number' || !Number.isFinite(body.high) || body.high < 0) {
      return NextResponse.json({ error: 'high must be a non-negative number' }, { status: 400 });
    }
    setClauses.push(`high = $${paramIndex++}`);
    values.push(body.high);
  }

  if (body.low !== undefined) {
    if (typeof body.low !== 'number' || !Number.isFinite(body.low) || body.low < 0) {
      return NextResponse.json({ error: 'low must be a non-negative number' }, { status: 400 });
    }
    setClauses.push(`low = $${paramIndex++}`);
    values.push(body.low);
  }

  if (body.purchasedAt !== undefined) {
    if (body.purchasedAt === null || body.purchasedAt === '') {
      setClauses.push(`purchased_at = $${paramIndex++}`);
      values.push(null);
    } else if (typeof body.purchasedAt === 'string') {
      const d = new Date(body.purchasedAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'purchasedAt must be a valid ISO date string' }, { status: 400 });
      }
      setClauses.push(`purchased_at = $${paramIndex++}`);
      values.push(d.toISOString());
    } else {
      return NextResponse.json({ error: 'purchasedAt invalid' }, { status: 400 });
    }
  }

  if (body.tokenAddress !== undefined) {
    if (body.tokenAddress === null || body.tokenAddress === '') {
      setClauses.push(`token_address = $${paramIndex++}`);
      values.push(null);
    } else if (typeof body.tokenAddress === 'string') {
      setClauses.push(`token_address = $${paramIndex++}`);
      values.push(body.tokenAddress.trim());
    } else {
      return NextResponse.json({ error: 'tokenAddress invalid' }, { status: 400 });
    }
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    setClauses.push(`name = $${paramIndex++}`);
    values.push(body.name.trim());
  }

  if (body.tokenName !== undefined) {
    if (body.tokenName === null || body.tokenName === '') {
      setClauses.push(`token_name = $${paramIndex++}`);
      values.push(null);
    } else if (typeof body.tokenName === 'string') {
      setClauses.push(`token_name = $${paramIndex++}`);
      values.push(body.tokenName.trim());
    } else {
      return NextResponse.json({ error: 'tokenName invalid' }, { status: 400 });
    }
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  values.push(tokenId, ruggerId);
  const rows = await query<{ id: string }>(
    `update rugger_tokens set ${setClauses.join(', ')} where id = $${paramIndex++} and rugger_id = $${paramIndex} returning id`,
    values
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; tokenId: string }> }
) {
  const auth = await requireUser(_req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, tokenId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  await query(
    'delete from rugger_tokens where id = $1 and rugger_id = $2',
    [tokenId, ruggerId]
  );
  return NextResponse.json({ ok: true });
}
