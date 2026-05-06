import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-session';
import type { TelegramPnlFavoriteDto } from '@/types/telegram';

async function ensureChannelOwnership(userId: string, channelId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `select id from telegram_channels where id = $1 and user_id = $2`,
    [channelId, userId]
  );
  return rows.length > 0;
}

/** Liste des favoris pour un canal. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const channelId = req.nextUrl.searchParams.get('channelId')?.trim() ?? '';
  if (!channelId) {
    return NextResponse.json({ error: 'channelId_obligatoire' }, { status: 400 });
  }

  if (!(await ensureChannelOwnership(userId, channelId))) {
    return NextResponse.json({ error: 'channel_introuvable' }, { status: 404 });
  }

  const rows = await query<{
    token_mint: string;
    token_name: string | null;
    created_at: string;
  }>(
    `select token_mint, token_name, created_at::text as created_at
     from telegram_pnl_favorites
     where user_id = $1 and channel_id = $2
     order by created_at desc`,
    [userId, channelId]
  );

  const favorites: TelegramPnlFavoriteDto[] = rows.map((r) => ({
    mint: r.token_mint,
    tokenName: r.token_name,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ favorites });
}

/** Ajouter / mettre à jour un favori. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  let body: { channelId?: unknown; tokenMint?: unknown; tokenName?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';
  const tokenMint = typeof body.tokenMint === 'string' ? body.tokenMint.trim() : '';
  const tokenName =
    typeof body.tokenName === 'string' ? (body.tokenName.trim() || null) : body.tokenName === null ? null : null;

  if (!channelId || !tokenMint) {
    return NextResponse.json({ error: 'channelId_et_tokenMint_obligatoires' }, { status: 400 });
  }

  if (!(await ensureChannelOwnership(userId, channelId))) {
    return NextResponse.json({ error: 'channel_introuvable' }, { status: 404 });
  }

  await query(
    `insert into telegram_pnl_favorites (user_id, channel_id, token_mint, token_name, created_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id, channel_id, token_mint) do update set
       token_name = coalesce(excluded.token_name, telegram_pnl_favorites.token_name)`,
    [userId, channelId, tokenMint, tokenName ?? null]
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** Retirer un favori. */
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const channelId = req.nextUrl.searchParams.get('channelId')?.trim() ?? '';
  const mint = req.nextUrl.searchParams.get('mint')?.trim() ?? '';
  if (!channelId || !mint) {
    return NextResponse.json({ error: 'channelId_et_mint_obligatoires' }, { status: 400 });
  }

  if (!(await ensureChannelOwnership(userId, channelId))) {
    return NextResponse.json({ error: 'channel_introuvable' }, { status: 404 });
  }

  await query(`delete from telegram_pnl_favorites where user_id = $1 and channel_id = $2 and token_mint = $3`, [
    userId,
    channelId,
    mint,
  ]);

  return NextResponse.json({ ok: true });
}
