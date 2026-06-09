import { query } from '@/lib/db';
import {
  RUGGER_LIST_SELECT,
  RUGGER_METRICS_RETURNING,
} from '@/lib/repositories/rugger-queries';
import type { Rugger, StatusId, WalletType } from '@/types/rugger';

export interface RuggerRow {
  id: string;
  name: string | null;
  description: string | null;
  wallet_address: string | null;
  wallet_type: WalletType;
  volume_min: number | null;
  volume_max: number | null;
  start_hour: number | null;
  end_hour: number | null;
  notes: string | null;
  status_id: StatusId;
  archived: boolean;
  created_at: string;
  token_count: number;
  avg_max_gain_percent: number;
}

/** Point unique de mapping snake_case → camelCase pour les ruggers. */
export function mapRugger(r: RuggerRow): Rugger {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    walletAddress: r.wallet_address,
    walletType: r.wallet_type,
    volumeMin: r.volume_min ?? null,
    volumeMax: r.volume_max ?? null,
    startHour: r.start_hour ?? null,
    endHour: r.end_hour ?? null,
    notes: r.notes ?? null,
    statusId: r.status_id,
    archived: r.archived,
    createdAt: r.created_at,
    tokenCount: r.token_count,
    avgMaxGainPercent: Number(r.avg_max_gain_percent),
  };
}

export async function listRuggers(args: {
  userId: string;
  page: number;
  pageSize: number;
  status: StatusId | null;
  archived: boolean;
}): Promise<{ ruggers: Rugger[]; total: number }> {
  const offset = (args.page - 1) * args.pageSize;

  const conditions = ['r.archived = $3', 'r.user_id = $4'];
  const params: (string | number | boolean)[] = [args.pageSize, offset, args.archived, args.userId];
  if (args.status) {
    conditions.push(`r.status_id = $${params.length + 1}`);
    params.push(args.status);
  }
  const whereClause = ' where ' + conditions.join(' and ');

  const rows = await query<RuggerRow>(
    `${RUGGER_LIST_SELECT} ${whereClause} order by r.created_at desc limit $1 offset $2`,
    params
  );

  const countConditions = ['archived = $1', 'user_id = $2'];
  const countParams: (string | boolean)[] = [args.archived, args.userId];
  if (args.status) {
    countConditions.push(`status_id = $${countParams.length + 1}`);
    countParams.push(args.status);
  }
  const countRows = await query<{ count: string }>(
    `select count(*)::text as count from ruggers where ${countConditions.join(' and ')}`,
    countParams
  );

  return { ruggers: rows.map(mapRugger), total: Number(countRows[0]?.count ?? '0') };
}

export async function getRugger(id: string, userId: string): Promise<Rugger | null> {
  const rows = await query<RuggerRow>(
    `${RUGGER_LIST_SELECT} where r.id = $1 and r.user_id = $2`,
    [id, userId]
  );
  return rows[0] ? mapRugger(rows[0]) : null;
}

export async function countRuggersForUser(userId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    'select count(*)::text as count from ruggers where user_id = $1',
    [userId]
  );
  return Number(rows[0]?.count ?? '0');
}

export async function insertRugger(args: {
  userId: string;
  name: string | null;
  description: string | null;
  walletAddress: string | null;
  walletType: WalletType;
  volumeMin: number | null;
  volumeMax: number | null;
  startHour: number | null;
  endHour: number | null;
  notes: string | null;
}): Promise<Rugger> {
  const rows = await query<RuggerRow>(
    `insert into ruggers (user_id, name, description, wallet_address, wallet_type, volume_min, volume_max, start_hour, end_hour, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning id, name, description, wallet_address, wallet_type, volume_min, volume_max, start_hour, end_hour, notes, status_id, archived, created_at,
       0::int as token_count, 0 as avg_max_gain_percent`,
    [
      args.userId,
      args.name,
      args.description,
      args.walletAddress,
      args.walletType,
      args.volumeMin,
      args.volumeMax,
      args.startHour,
      args.endHour,
      args.notes,
    ]
  );
  return mapRugger(rows[0]);
}

const UPDATE_COLUMN_BY_FIELD: Record<string, string> = {
  name: 'name',
  description: 'description',
  walletAddress: 'wallet_address',
  walletType: 'wallet_type',
  volumeMin: 'volume_min',
  volumeMax: 'volume_max',
  startHour: 'start_hour',
  endHour: 'end_hour',
  notes: 'notes',
  statusId: 'status_id',
  archived: 'archived',
};

export interface RuggerUpdate {
  name?: string | null;
  description?: string | null;
  walletAddress?: string | null;
  walletType?: WalletType;
  volumeMin?: number | null;
  volumeMax?: number | null;
  startHour?: number | null;
  endHour?: number | null;
  notes?: string | null;
  statusId?: StatusId;
  archived?: boolean;
}

/**
 * Update partiel : seules les clés définies dans `patch` sont écrites.
 * Retourne le rugger à jour, ou null s'il n'existe pas pour cet utilisateur.
 */
export async function updateRugger(
  id: string,
  userId: string,
  patch: RuggerUpdate
): Promise<Rugger | null> {
  const updates: string[] = [];
  const values: (string | number | boolean | null)[] = [];

  for (const [field, column] of Object.entries(UPDATE_COLUMN_BY_FIELD)) {
    const value = (patch as Record<string, unknown>)[field];
    if (value === undefined) continue;
    updates.push(`${column} = $${values.length + 1}`);
    values.push(value as string | number | boolean | null);
  }

  if (updates.length === 0) {
    return getRugger(id, userId);
  }

  values.push(id, userId);
  const rows = await query<RuggerRow>(
    `update ruggers set ${updates.join(', ')}
     where id = $${values.length - 1} and user_id = $${values.length}
     returning id, name, description, wallet_address, wallet_type, volume_min, volume_max, start_hour, end_hour, notes, status_id, archived, created_at,
       ${RUGGER_METRICS_RETURNING}`,
    values
  );
  return rows[0] ? mapRugger(rows[0]) : null;
}

export async function getRuggerWalletInfo(
  id: string,
  userId: string
): Promise<{ walletAddress: string | null; walletType: WalletType } | null> {
  const rows = await query<{ wallet_address: string | null; wallet_type: WalletType }>(
    'select wallet_address, wallet_type from ruggers where id = $1 and user_id = $2',
    [id, userId]
  );
  const r = rows[0];
  return r ? { walletAddress: r.wallet_address, walletType: r.wallet_type } : null;
}

export async function ruggerExists(id: string, userId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'select id from ruggers where id = $1 and user_id = $2',
    [id, userId]
  );
  return rows.length > 0;
}

export async function deleteRuggerCascade(id: string, userId: string): Promise<void> {
  await query('delete from rugger_tokens where rugger_id = $1', [id]);
  await query('delete from ruggers where id = $1 and user_id = $2', [id, userId]);
}
