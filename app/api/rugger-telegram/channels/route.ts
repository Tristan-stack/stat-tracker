import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-session';
import { normalizeTelegramUsername } from '@/lib/telegram/username';
import { getPostgresErrorCode } from '@/lib/pg-errors';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const rows = await query<{
    id: string;
    username: string;
    label: string | null;
    created_at: string;
  }>(
    `select id, username, label, created_at from telegram_channels
     where user_id = $1
     order by created_at desc`,
    [userId]
  );

  return NextResponse.json({ channels: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const usernameRaw = typeof (body as { username?: unknown }).username === 'string' ? (body as { username: string }).username : '';
  const labelRaw = typeof (body as { label?: unknown }).label === 'string' ? (body as { label: string }).label : null;

  const username = normalizeTelegramUsername(usernameRaw);
  if (username.length < 3 || username.length > 64) {
    return NextResponse.json({ error: 'username_invalide' }, { status: 400 });
  }

  const id = randomUUID();
  try {
    await query(
      `insert into telegram_channels (id, user_id, username, label, created_at)
       values ($1, $2, $3, $4, now())`,
      [id, userId, username, labelRaw?.trim() || null]
    );
  } catch (err) {
    if (getPostgresErrorCode(err) === '23505') {
      return NextResponse.json({ error: 'channel_deja_enregistre' }, { status: 409 });
    }
    throw err;
  }

  const rows = await query<{
    id: string;
    username: string;
    label: string | null;
    created_at: string;
  }>(`select id, username, label, created_at from telegram_channels where id = $1 and user_id = $2`, [id, userId]);

  return NextResponse.json({ channel: rows[0] ?? null }, { status: 201 });
}
