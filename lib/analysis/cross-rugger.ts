import { query } from '@/lib/db';
import type { CrossRuggerMatch } from '@/types/analysis';

/**
 * Find buyer wallets that appear in multiple ruggers' analyses
 * for the same user. Only wallets present in ≥2 distinct ruggers
 * are returned.
 */
export async function findCrossRuggerWallets(
  userId: string,
  walletAddresses: string[]
): Promise<CrossRuggerMatch[]> {
  if (walletAddresses.length === 0) return [];

  const placeholders = walletAddresses.map((_, i) => `$${i + 2}`).join(', ');

  const rows = await query<{
    wallet_address: string;
    rugger_names: string;
    rugger_ids: string;
  }>(
    `SELECT bw.wallet_address,
            string_agg(DISTINCT COALESCE(r.name, LEFT(r.wallet_address, 10)), ', ') AS rugger_names,
            string_agg(DISTINCT r.id, ',') AS rugger_ids
     FROM analysis_buyer_wallets bw
     JOIN wallet_analyses wa ON wa.id = bw.analysis_id
     JOIN ruggers r ON r.id = wa.rugger_id
     WHERE r.user_id = $1
       AND bw.wallet_address IN (${placeholders})
     GROUP BY bw.wallet_address
     HAVING count(DISTINCT wa.rugger_id) > 1`,
    [userId, ...walletAddresses]
  );

  return rows.map((r) => ({
    walletAddress: r.wallet_address,
    ruggerNames: r.rugger_names.split(', '),
    ruggerIds: r.rugger_ids.split(','),
  }));
}
