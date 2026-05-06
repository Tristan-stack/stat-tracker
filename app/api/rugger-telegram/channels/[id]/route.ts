import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-session';

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const rows = await query<{ id: string }>(
    `delete from telegram_channels where id = $1 and user_id = $2 returning id`,
    [id, userId]
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
