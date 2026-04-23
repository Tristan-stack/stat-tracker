import { query } from '@/lib/db';

export interface PnlBackgroundRow {
  id: string;
  name: string | null;
  image_data: string;
  created_at: string;
  updated_at: string;
}

export async function listPnlBackgrounds(userId: string): Promise<PnlBackgroundRow[]> {
  return query<PnlBackgroundRow>(
    `SELECT id, name, image_data, created_at, updated_at
     FROM pnl_backgrounds
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
}

export async function addPnlBackground(args: { userId: string; name: string | null; imageData: string }): Promise<void> {
  await query(
    `INSERT INTO pnl_backgrounds (user_id, name, image_data, updated_at)
     VALUES ($1, $2, $3, NOW())`,
    [args.userId, args.name, args.imageData]
  );
}

export async function deletePnlBackground(args: { userId: string; id: string }): Promise<void> {
  await query(
    `DELETE FROM pnl_backgrounds
     WHERE user_id = $1 AND id = $2`,
    [args.userId, args.id]
  );
}

