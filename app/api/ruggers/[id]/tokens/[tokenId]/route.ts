import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; tokenId: string }> }
) {
  const { id: ruggerId, tokenId } = await context.params;
  const body = (await req.json()) as { targetExitPercent?: number; entryPrice?: number };

  const setClauses: string[] = [];
  const values: (number | string)[] = [];
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
  const { id: ruggerId, tokenId } = await context.params;
  await query(
    'delete from rugger_tokens where id = $1 and rugger_id = $2',
    [tokenId, ruggerId]
  );
  return NextResponse.json({ ok: true });
}
