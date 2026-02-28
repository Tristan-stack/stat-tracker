import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

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
