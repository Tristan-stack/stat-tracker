import { query } from '@/lib/db';

export interface WalletMetadataRow {
  wallet_address: string;
  created_at: string | null;
  creation_source: string;
  last_fetched_at: string;
}

export async function getWalletMetadataForUser(userId: string, walletAddresses: string[]): Promise<WalletMetadataRow[]> {
  if (walletAddresses.length === 0) return [];
  return query<WalletMetadataRow>(
    `SELECT wallet_address, created_at, creation_source, last_fetched_at
     FROM wallet_metadata
     WHERE user_id = $1 AND wallet_address = ANY($2::text[])`,
    [userId, walletAddresses]
  );
}

export async function upsertWalletMetadata(args: {
  userId: string;
  walletAddress: string;
  createdAt: Date | null;
  creationSource: string;
}): Promise<void> {
  await query(
    `INSERT INTO wallet_metadata (user_id, wallet_address, created_at, creation_source, last_fetched_at, updated_at)
     VALUES ($1, $2, $3::timestamp, $4, NOW(), NOW())
     ON CONFLICT (user_id, wallet_address)
     DO UPDATE SET
       created_at = COALESCE(wallet_metadata.created_at, EXCLUDED.created_at),
       creation_source = EXCLUDED.creation_source,
       last_fetched_at = NOW(),
       updated_at = NOW()`,
    [args.userId, args.walletAddress, args.createdAt ? args.createdAt.toISOString() : null, args.creationSource]
  );
}

