import { query } from '@/lib/db';
import type { WatchlistWallet } from '@/types/watchlist';

export interface WatchlistRow {
  id: string;
  wallet_address: string;
  label: string | null;
  notes: string | null;
  source_rugger_id: string | null;
  rugger_name: string | null;
  created_at: string;
}

export function mapWatchlistRow(r: WatchlistRow): WatchlistWallet {
  return {
    id: r.id,
    walletAddress: r.wallet_address,
    label: r.label,
    notes: r.notes,
    sourceRuggerId: r.source_rugger_id,
    sourceRuggerName: r.rugger_name,
    createdAt: r.created_at,
  };
}

const SELECT_WITH_RUGGER = `
  SELECT w.id, w.wallet_address, w.label, w.notes, w.source_rugger_id,
         r.name AS rugger_name, w.created_at
  FROM watchlist_wallets w
  LEFT JOIN ruggers r ON r.id = w.source_rugger_id`;

/** Colonnes renvoyées par insert/update (pas de join → rugger_name null). */
const RETURNING_NO_JOIN = `
  id, wallet_address, label, notes, source_rugger_id, NULL::text AS rugger_name, created_at`;

export async function listWatchlist(userId: string): Promise<WatchlistWallet[]> {
  const rows = await query<WatchlistRow>(
    `${SELECT_WITH_RUGGER} WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
    [userId]
  );
  return rows.map(mapWatchlistRow);
}

export async function findWatchlistIdByAddress(
  userId: string,
  walletAddress: string
): Promise<string | null> {
  const rows = await query<{ id: string }>(
    'SELECT id FROM watchlist_wallets WHERE user_id = $1 AND wallet_address = $2',
    [userId, walletAddress]
  );
  return rows[0]?.id ?? null;
}

export async function insertWatchlist(args: {
  userId: string;
  walletAddress: string;
  label: string | null;
  notes: string | null;
  sourceRuggerId: string | null;
}): Promise<WatchlistWallet> {
  const rows = await query<WatchlistRow>(
    `INSERT INTO watchlist_wallets (id, user_id, wallet_address, label, notes, source_rugger_id)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
     RETURNING ${RETURNING_NO_JOIN}`,
    [args.userId, args.walletAddress, args.label, args.notes, args.sourceRuggerId]
  );
  return mapWatchlistRow(rows[0]);
}

/** Met à jour label/notes ; `null` = inchangé (COALESCE). Retourne null si absent. */
export async function updateWatchlist(args: {
  id: string;
  userId: string;
  label: string | null;
  notes: string | null;
}): Promise<WatchlistWallet | null> {
  const rows = await query<WatchlistRow>(
    `UPDATE watchlist_wallets
     SET label = COALESCE($3, label), notes = COALESCE($4, notes)
     WHERE id = $1 AND user_id = $2
     RETURNING ${RETURNING_NO_JOIN}`,
    [args.id, args.userId, args.label, args.notes]
  );
  return rows[0] ? mapWatchlistRow(rows[0]) : null;
}

export async function deleteWatchlist(id: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM watchlist_wallets WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows.length > 0;
}
