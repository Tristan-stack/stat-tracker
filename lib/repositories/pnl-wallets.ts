import { query } from '@/lib/db';

export interface PnlWalletRow {
  id: string;
  wallet_address: string;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export async function listPnlWallets(userId: string): Promise<PnlWalletRow[]> {
  return query<PnlWalletRow>(
    `SELECT id, wallet_address, label, created_at, updated_at
     FROM pnl_wallets
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
}

export async function addPnlWallet(args: { userId: string; walletAddress: string; label: string | null }): Promise<void> {
  await query(
    `INSERT INTO pnl_wallets (user_id, wallet_address, label, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, wallet_address)
     DO UPDATE SET
      label = COALESCE(EXCLUDED.label, pnl_wallets.label),
      updated_at = NOW()`,
    [args.userId, args.walletAddress, args.label]
  );
}

export async function deletePnlWallet(args: { userId: string; walletAddress: string }): Promise<void> {
  await query(
    `DELETE FROM pnl_wallets
     WHERE user_id = $1 AND wallet_address = $2`,
    [args.userId, args.walletAddress]
  );
}

