import { query } from '@/lib/db';
import type { PnlWallet } from '@/types/pnl';

export interface PnlWalletRow {
  id: string;
  wallet_address: string;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export function mapPnlWalletRow(row: PnlWalletRow): PnlWallet {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPnlWallets(userId: string): Promise<PnlWallet[]> {
  const rows = await query<PnlWalletRow>(
    `SELECT id, wallet_address, label, created_at, updated_at
     FROM pnl_wallets
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(mapPnlWalletRow);
}

/**
 * Insère un wallet PNL. Retourne `null` si l'adresse existe déjà pour cet utilisateur
 * (ON CONFLICT DO NOTHING → aucune ligne retournée), à traiter en 409 côté route.
 */
export async function insertPnlWallet(args: {
  userId: string;
  walletAddress: string;
  label: string | null;
}): Promise<PnlWallet | null> {
  const rows = await query<PnlWalletRow>(
    `INSERT INTO pnl_wallets (user_id, wallet_address, label)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, wallet_address) DO NOTHING
     RETURNING id, wallet_address, label, created_at, updated_at`,
    [args.userId, args.walletAddress, args.label]
  );
  const row = rows[0];
  return row ? mapPnlWalletRow(row) : null;
}

export async function updatePnlWallet(args: {
  id: string;
  userId: string;
  label: string | null;
}): Promise<PnlWallet | null> {
  const rows = await query<PnlWalletRow>(
    `UPDATE pnl_wallets
     SET label = $3, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, wallet_address, label, created_at, updated_at`,
    [args.id, args.userId, args.label]
  );
  const row = rows[0];
  return row ? mapPnlWalletRow(row) : null;
}

export async function deletePnlWallet(args: { id: string; userId: string }): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM pnl_wallets WHERE id = $1 AND user_id = $2 RETURNING id',
    [args.id, args.userId]
  );
  return rows.length > 0;
}
