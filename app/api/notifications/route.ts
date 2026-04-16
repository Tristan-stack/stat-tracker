import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface NotificationRow {
  id: string;
  type: string;
  wallet_address: string;
  wallet_label: string | null;
  token_address: string | null;
  token_symbol: string | null;
  amount_sol: string | null;
  tx_signature: string;
  occurred_at: string;
  read_at: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limitRaw = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT));

  const rows = unreadOnly
    ? await query<NotificationRow>(
        `SELECT id, type, wallet_address, wallet_label, token_address, token_symbol,
                amount_sol, tx_signature, occurred_at, read_at, created_at
         FROM notifications
         WHERE user_id = $1 AND read_at IS NULL
         ORDER BY occurred_at DESC
         LIMIT $2`,
        [userId, limit]
      )
    : await query<NotificationRow>(
        `SELECT id, type, wallet_address, wallet_label, token_address, token_symbol,
                amount_sol, tx_signature, occurred_at, read_at, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY occurred_at DESC
         LIMIT $2`,
        [userId, limit]
      );

  const countRows = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  const unreadCount = Number(countRows[0]?.count ?? 0);

  const notifications = rows.map((r) => ({
    id: r.id,
    type: r.type,
    walletAddress: r.wallet_address,
    walletLabel: r.wallet_label,
    tokenAddress: r.token_address,
    tokenSymbol: r.token_symbol,
    amountSol: r.amount_sol !== null ? Number(r.amount_sol) : null,
    txSignature: r.tx_signature,
    occurredAt: r.occurred_at,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ notifications, unreadCount });
}
