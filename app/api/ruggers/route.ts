import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-session';
import { getPostgresErrorCode } from '@/lib/pg-errors';
import { RUGGER_LIST_SELECT } from '@/lib/repositories/rugger-queries';
import type { Rugger, WalletType, StatusId } from '@/types/rugger';

const VALID_STATUS_IDS: StatusId[] = ['verification', 'en_test', 'actif'];

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const statusParam = searchParams.get('status');
  const statusFilter: StatusId | null =
    statusParam && VALID_STATUS_IDS.includes(statusParam as StatusId) ? (statusParam as StatusId) : null;
  const archivedParam = searchParams.get('archived');
  const showArchived = archivedParam === 'true';

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20;
  const offset = (safePage - 1) * safePageSize;

  const conditions: string[] = [`r.archived = $3`, `r.user_id = $4`];
  const mainParams: (string | number | boolean)[] = [safePageSize, offset, showArchived, userId];
  if (statusFilter) {
    conditions.push(`r.status_id = $${mainParams.length + 1}`);
    mainParams.push(statusFilter);
  }
  const whereClause = ' where ' + conditions.join(' and ');

  const rows = await query<{
    id: string;
    name: string | null;
    description: string | null;
    wallet_address: string;
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
  }>(`${RUGGER_LIST_SELECT} ${whereClause} order by r.created_at desc limit $1 offset $2`, mainParams);

  const countConditions: string[] = ['archived = $1', 'user_id = $2'];
  const countParams: (string | boolean)[] = [showArchived, userId];
  if (statusFilter) {
    countConditions.push(`status_id = $${countParams.length + 1}`);
    countParams.push(statusFilter);
  }
  const countRows = await query<{ count: string }>(
    `select count(*)::text as count from ruggers where ${countConditions.join(' and ')}`,
    countParams
  );
  const total = Number(countRows[0]?.count ?? '0');

  const ruggers: Rugger[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    walletAddress: row.wallet_address,
    walletType: row.wallet_type,
    volumeMin: row.volume_min ?? null,
    volumeMax: row.volume_max ?? null,
    startHour: row.start_hour ?? null,
    endHour: row.end_hour ?? null,
    notes: row.notes ?? null,
    statusId: row.status_id,
    archived: row.archived,
    createdAt: row.created_at,
    tokenCount: row.token_count,
    avgMaxGainPercent: Number(row.avg_max_gain_percent),
  }));

  return NextResponse.json({ ruggers, page: safePage, pageSize: safePageSize, total });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    walletAddress?: string;
    walletType?: WalletType;
    volumeMin?: number | null;
    volumeMax?: number | null;
    startHour?: number | null;
    endHour?: number | null;
    notes?: string | null;
  };

  const walletAddress = body.walletAddress?.trim() ?? '';
  const walletType = body.walletType;
  let name = body.name?.trim() ?? null;
  const description = body.description?.trim() ?? null;
  const toNum = (v: unknown): number | null =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  const volumeMin = toNum(body.volumeMin);
  const volumeMax = toNum(body.volumeMax);
  const toHour = (v: unknown): number | null => {
    const n = toNum(v);
    return n != null && n >= 0 && n <= 23 ? n : null;
  };
  const startHour = toHour(body.startHour);
  const endHour = toHour(body.endHour);
  const notes = typeof body.notes === 'string' ? (body.notes.trim() || null) : null;

  if (walletAddress === '' || !walletType || !['exchange', 'mother', 'simple'].includes(walletType)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (name === '' || name === null) {
    const countRows = await query<{ count: string }>(
      `select count(*)::text as count from ruggers where user_id = $1`,
      [userId]
    );
    const count = Number(countRows[0]?.count ?? '0');
    name = String(count + 1);
  }

  let rows: {
    id: string;
    name: string | null;
    description: string | null;
    wallet_address: string;
    wallet_type: WalletType;
    volume_min: number | null;
    volume_max: number | null;
    start_hour: number | null;
    end_hour: number | null;
    notes: string | null;
    status_id: StatusId;
    created_at: string;
  }[];

  try {
    rows = await query(
      `
      insert into ruggers (user_id, name, description, wallet_address, wallet_type, volume_min, volume_max, start_hour, end_hour, notes)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning id, name, description, wallet_address, wallet_type, volume_min, volume_max, start_hour, end_hour, notes, status_id, created_at
    `,
      [userId, name, description, walletAddress, walletType, volumeMin, volumeMax, startHour, endHour, notes]
    );
  } catch (e) {
    const code = getPostgresErrorCode(e);
    if (code === '23505') {
      return NextResponse.json(
        {
          error:
            'Un rugger avec cette adresse wallet existe déjà pour ton compte. Modifie l’existant ou utilise une autre adresse.',
        },
        { status: 409 }
      );
    }
    if (code === '23503') {
      return NextResponse.json(
        { error: 'Compte utilisateur invalide en base. Reconnecte-toi ou contacte le support.' },
        { status: 400 }
      );
    }
    console.error('[POST /api/ruggers]', e);
    return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 });
  }

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: 'Insert sans ligne retournée' }, { status: 500 });
  }

  const rugger: Rugger = {
    id: row.id,
    name: row.name,
    description: row.description,
    walletAddress: row.wallet_address,
    walletType: row.wallet_type,
    volumeMin: row.volume_min ?? null,
    volumeMax: row.volume_max ?? null,
    startHour: row.start_hour ?? null,
    endHour: row.end_hour ?? null,
    notes: row.notes ?? null,
    statusId: row.status_id,
    archived: false,
    createdAt: row.created_at,
    tokenCount: 0,
    avgMaxGainPercent: 0,
  };

  return NextResponse.json(rugger, { status: 201 });
}
