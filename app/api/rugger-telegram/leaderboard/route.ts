import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-session';
import type { TelegramLeaderboardRow } from '@/types/telegram';

/** Tri SQL sur les agrégats réels (numérique / temporal) — pas les alias `::text` du SELECT. */
const ORDER_BY_SQL: Record<string, string> = {
  profitSol: 'sum(coalesce(profit_sol, 0))',
  profitPct: 'avg(profit_pct)',
  invested: 'sum(coalesce(invested_sol, 0))',
  sold: 'sum(coalesce(sold_sol, 0))',
  posts: 'count(*)',
  fetchedAt: 'max(parsed_at)',
};

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId')?.trim() ?? '';
  const fromIso = searchParams.get('from')?.trim() ?? '';
  const toIso = searchParams.get('to')?.trim() ?? '';
  const sortBy = searchParams.get('sortBy')?.trim() ?? 'profitSol';
  const dirParam = searchParams.get('dir')?.trim().toLowerCase() ?? 'desc';

  if (!channelId || !fromIso || !toIso) {
    return NextResponse.json({ error: 'channelId_from_et_to_obligatoires' }, { status: 400 });
  }

  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    return NextResponse.json({ error: 'plage_dates_invalide' }, { status: 400 });
  }

  const owner = await query<{ id: string }>(
    `select id from telegram_channels where id = $1 and user_id = $2`,
    [channelId, userId]
  );
  if (owner.length === 0) return NextResponse.json({ error: 'channel_introuvable' }, { status: 404 });

  const orderExpr = ORDER_BY_SQL[sortBy] ?? ORDER_BY_SQL.profitSol;
  const dir = dirParam === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    select token_mint,
           max(token_name)::text as token_name,
           max(parsed_at) as fetched_at,
           sum(coalesce(invested_sol, 0))::text as invested,
           sum(coalesce(sold_sol, 0))::text as sold,
           sum(coalesce(profit_sol, 0))::text as profit,
           avg(profit_pct)::text as avg_profit_pct,
           count(*)::text as posts
    from telegram_pnl_messages
    where channel_id = $1
      and posted_at >= $2::timestamptz
      and posted_at <= $3::timestamptz
      and token_mint is not null
    group by token_mint
    order by ${orderExpr} ${dir} nulls last
    limit 400
  `;

  const rows = await query<TelegramLeaderboardRow>(sql, [channelId, fromIso, toIso]);
  return NextResponse.json({ rows });
}
