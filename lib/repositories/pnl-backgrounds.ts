import { query } from '@/lib/db';
import type { PnlBackground, PnlBackgroundMeta } from '@/types/pnl';

export interface PnlBackgroundMetaRow {
  id: string;
  name: string | null;
  created_at: string;
}

export interface PnlBackgroundRow extends PnlBackgroundMetaRow {
  image_data: string;
}

function mapMeta(row: PnlBackgroundMetaRow): PnlBackgroundMeta {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

/** Liste sans `image_data` (les images base64 peuvent être volumineuses). */
export async function listPnlBackgroundsMeta(userId: string): Promise<PnlBackgroundMeta[]> {
  const rows = await query<PnlBackgroundMetaRow>(
    `SELECT id, name, created_at
     FROM pnl_backgrounds
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(mapMeta);
}

export async function getPnlBackground(args: {
  id: string;
  userId: string;
}): Promise<PnlBackground | null> {
  const rows = await query<PnlBackgroundRow>(
    `SELECT id, name, image_data, created_at
     FROM pnl_backgrounds
     WHERE id = $1 AND user_id = $2`,
    [args.id, args.userId]
  );
  const row = rows[0];
  if (!row) return null;
  return { ...mapMeta(row), imageData: row.image_data };
}

export async function insertPnlBackground(args: {
  userId: string;
  name: string | null;
  imageData: string;
}): Promise<PnlBackgroundMeta> {
  const rows = await query<PnlBackgroundMetaRow>(
    `INSERT INTO pnl_backgrounds (user_id, name, image_data)
     VALUES ($1, $2, $3)
     RETURNING id, name, created_at`,
    [args.userId, args.name, args.imageData]
  );
  return mapMeta(rows[0]);
}

export async function deletePnlBackground(args: { id: string; userId: string }): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM pnl_backgrounds WHERE id = $1 AND user_id = $2 RETURNING id',
    [args.id, args.userId]
  );
  return rows.length > 0;
}
