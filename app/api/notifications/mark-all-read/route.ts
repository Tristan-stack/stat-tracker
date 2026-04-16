import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const rows = await query<{ id: string }>(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL
     RETURNING id`,
    [userId]
  );

  return NextResponse.json({ ok: true, markedCount: rows.length });
}
