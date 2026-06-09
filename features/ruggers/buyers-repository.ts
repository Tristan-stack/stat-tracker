import { query } from '@/lib/db';
import type { RuggerBuyerOrigin, RuggerBuyerWallet } from '@/types/rugger-buyer';

export interface RuggerBuyerRow {
  id: string;
  rugger_id: string;
  wallet_address: string;
  label: string | null;
  notes: string | null;
  origin: RuggerBuyerOrigin;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, rugger_id, wallet_address, label, notes, origin, created_at, updated_at';

/** Point unique de mapping snake_case → camelCase pour les buyers. */
export function mapBuyer(row: RuggerBuyerRow): RuggerBuyerWallet {
  return {
    id: row.id,
    ruggerId: row.rugger_id,
    walletAddress: row.wallet_address,
    label: row.label,
    notes: row.notes,
    origin: row.origin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listBuyers(ruggerId: string): Promise<RuggerBuyerWallet[]> {
  const rows = await query<RuggerBuyerRow>(
    `SELECT ${COLUMNS} FROM rugger_buyer_wallets WHERE rugger_id = $1 ORDER BY created_at DESC`,
    [ruggerId]
  );
  return rows.map(mapBuyer);
}

export async function insertBuyer(args: {
  ruggerId: string;
  walletAddress: string;
  label: string | null;
  notes: string | null;
  origin: RuggerBuyerOrigin;
}): Promise<RuggerBuyerWallet> {
  const rows = await query<RuggerBuyerRow>(
    `INSERT INTO rugger_buyer_wallets (id, rugger_id, wallet_address, label, notes, origin)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [args.ruggerId, args.walletAddress, args.label, args.notes, args.origin]
  );
  return mapBuyer(rows[0]);
}

export async function getBuyer(
  buyerId: string,
  ruggerId: string
): Promise<RuggerBuyerWallet | null> {
  const rows = await query<RuggerBuyerRow>(
    `SELECT ${COLUMNS} FROM rugger_buyer_wallets WHERE id = $1 AND rugger_id = $2`,
    [buyerId, ruggerId]
  );
  return rows[0] ? mapBuyer(rows[0]) : null;
}

export async function buyerExistsForUser(
  buyerId: string,
  ruggerId: string,
  userId: string
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT rbw.id
     FROM rugger_buyer_wallets rbw
     JOIN ruggers r ON r.id = rbw.rugger_id
     WHERE rbw.id = $1 AND rbw.rugger_id = $2 AND r.user_id = $3`,
    [buyerId, ruggerId, userId]
  );
  return rows.length > 0;
}

export interface BuyerUpdate {
  walletAddress?: string;
  label?: string | null;
  notes?: string | null;
  origin?: RuggerBuyerOrigin;
}

export async function updateBuyer(
  buyerId: string,
  ruggerId: string,
  patch: BuyerUpdate
): Promise<RuggerBuyerWallet | null> {
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (patch.walletAddress !== undefined) {
    updates.push(`wallet_address = $${values.length + 1}`);
    values.push(patch.walletAddress);
  }
  if (patch.label !== undefined) {
    updates.push(`label = $${values.length + 1}`);
    values.push(patch.label);
  }
  if (patch.notes !== undefined) {
    updates.push(`notes = $${values.length + 1}`);
    values.push(patch.notes);
  }
  if (patch.origin !== undefined) {
    updates.push(`origin = $${values.length + 1}`);
    values.push(patch.origin);
  }

  if (updates.length === 0) {
    return getBuyer(buyerId, ruggerId);
  }

  updates.push('updated_at = now()');
  values.push(buyerId, ruggerId);
  const rows = await query<RuggerBuyerRow>(
    `UPDATE rugger_buyer_wallets SET ${updates.join(', ')}
     WHERE id = $${values.length - 1} AND rugger_id = $${values.length}
     RETURNING ${COLUMNS}`,
    values
  );
  return rows[0] ? mapBuyer(rows[0]) : null;
}

export async function deleteBuyer(buyerId: string, ruggerId: string): Promise<void> {
  await query('DELETE FROM rugger_buyer_wallets WHERE id = $1 AND rugger_id = $2', [
    buyerId,
    ruggerId,
  ]);
}
