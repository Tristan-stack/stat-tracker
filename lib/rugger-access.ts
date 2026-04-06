import { query } from '@/lib/db';

export async function ruggerExistsForUser(ruggerId: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'select id from ruggers where id = $1 and user_id = $2',
    [ruggerId, userId]
  );
  return rows.length > 0;
}
