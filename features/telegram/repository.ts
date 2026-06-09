import { query } from '@/lib/db';
import type {
  TelegramChannelRow,
  TelegramPnlFavoriteDto,
  TelegramLeaderboardRow,
} from '@/types/telegram';

const CHANNEL_COLS = 'id, username, label, created_at';

// --- Channels --------------------------------------------------------------

export async function listChannels(userId: string): Promise<TelegramChannelRow[]> {
  return query<TelegramChannelRow>(
    `select ${CHANNEL_COLS} from telegram_channels where user_id = $1 order by created_at desc`,
    [userId]
  );
}

export async function getChannelById(id: string, userId: string): Promise<TelegramChannelRow | null> {
  const rows = await query<TelegramChannelRow>(
    `select ${CHANNEL_COLS} from telegram_channels where id = $1 and user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

export async function insertChannel(args: {
  id: string;
  userId: string;
  username: string;
  label: string | null;
}): Promise<void> {
  await query(
    `insert into telegram_channels (id, user_id, username, label, created_at) values ($1, $2, $3, $4, now())`,
    [args.id, args.userId, args.username, args.label]
  );
}

export async function deleteChannel(id: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `delete from telegram_channels where id = $1 and user_id = $2 returning id`,
    [id, userId]
  );
  return rows.length > 0;
}

export async function channelExistsForUser(channelId: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `select id from telegram_channels where id = $1 and user_id = $2`,
    [channelId, userId]
  );
  return rows.length > 0;
}

/** Username du canal (scrape) — null si non possédé. */
export async function getChannelUsername(channelId: string, userId: string): Promise<string | null> {
  const rows = await query<{ username: string }>(
    `select username from telegram_channels where id = $1 and user_id = $2`,
    [channelId, userId]
  );
  return rows[0]?.username ?? null;
}

// --- Favorites -------------------------------------------------------------

export async function listFavorites(userId: string, channelId: string): Promise<TelegramPnlFavoriteDto[]> {
  const rows = await query<{ token_mint: string; token_name: string | null; created_at: string }>(
    `select token_mint, token_name, created_at::text as created_at
     from telegram_pnl_favorites
     where user_id = $1 and channel_id = $2
     order by created_at desc`,
    [userId, channelId]
  );
  return rows.map((r) => ({ mint: r.token_mint, tokenName: r.token_name, createdAt: r.created_at }));
}

export async function upsertFavorite(args: {
  userId: string;
  channelId: string;
  tokenMint: string;
  tokenName: string | null;
}): Promise<void> {
  await query(
    `insert into telegram_pnl_favorites (user_id, channel_id, token_mint, token_name, created_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id, channel_id, token_mint) do update set
       token_name = coalesce(excluded.token_name, telegram_pnl_favorites.token_name)`,
    [args.userId, args.channelId, args.tokenMint, args.tokenName]
  );
}

export async function deleteFavorite(userId: string, channelId: string, mint: string): Promise<void> {
  await query(
    `delete from telegram_pnl_favorites where user_id = $1 and channel_id = $2 and token_mint = $3`,
    [userId, channelId, mint]
  );
}

// --- Leaderboard -----------------------------------------------------------

/** Tri SQL sur les agrégats réels — pas les alias `::text` du SELECT. */
const ORDER_BY_SQL: Record<string, string> = {
  profitSol: 'sum(coalesce(profit_sol, 0))',
  profitPct: 'avg(profit_pct)',
  invested: 'sum(coalesce(invested_sol, 0))',
  sold: 'sum(coalesce(sold_sol, 0))',
  posts: 'count(*)',
  fetchedAt: 'max(parsed_at)',
};

export async function getLeaderboard(args: {
  channelId: string;
  fromIso: string;
  toIso: string;
  sortBy: string;
  dir: 'asc' | 'desc';
}): Promise<TelegramLeaderboardRow[]> {
  const orderExpr = ORDER_BY_SQL[args.sortBy] ?? ORDER_BY_SQL.profitSol;
  const dir = args.dir === 'asc' ? 'ASC' : 'DESC';

  return query<TelegramLeaderboardRow>(
    `select token_mint,
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
     limit 400`,
    [args.channelId, args.fromIso, args.toIso]
  );
}
