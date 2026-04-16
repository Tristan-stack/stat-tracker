import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id } = await context.params;

  const body = (await req.json().catch(() => ({}))) as { read?: boolean };
  const markRead = body.read !== false;

  const rows = await query<{ id: string }>(
    `UPDATE notifications
     SET read_at = ${markRead ? 'COALESCE(read_at, NOW())' : 'NULL'}
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [id, userId]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, read: markRead });
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
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
