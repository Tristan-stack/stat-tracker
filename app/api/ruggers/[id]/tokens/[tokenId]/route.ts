import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; tokenId: string }> }
) {
  const { id: ruggerId, tokenId } = await context.params;
  const body = (await req.json()) as { targetExitPercent?: number };

  if (typeof body.targetExitPercent !== 'number' || !Number.isFinite(body.targetExitPercent)) {
    return NextResponse.json({ error: 'targetExitPercent must be a number' }, { status: 400 });
  }

  const rows = await query<{ id: string }>(
    'update rugger_tokens set target_exit_percent = $1 where id = $2 and rugger_id = $3 returning id',
    [body.targetExitPercent, tokenId, ruggerId]
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
