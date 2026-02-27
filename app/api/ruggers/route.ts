import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { Rugger, WalletType } from '@/types/rugger';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20;
  const offset = (safePage - 1) * safePageSize;

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
    created_at: string;
    token_count: number;
    avg_max_gain_percent: number;
  }>(
    `
      select
        r.id,
        r.name,
        r.description,
        r.wallet_address,
        r.wallet_type,
        r.volume_min,
        r.volume_max,
        r.start_hour,
        r.end_hour,
        r.notes,
        r.created_at,
        (select count(*)::int from rugger_tokens t where t.rugger_id = r.id) as token_count,
        (select coalesce(avg((t.high - t.entry_price) / nullif(t.entry_price, 0) * 100), 0) from rugger_tokens t where t.rugger_id = r.id) as avg_max_gain_percent
      from ruggers r
      order by r.created_at desc
      limit $1 offset $2
    `,
    [safePageSize, offset]
  );

  const countRows = await query<{ count: string }>(`select count(*)::text as count from ruggers`, []);
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
    createdAt: row.created_at,
    tokenCount: row.token_count,
    avgMaxGainPercent: Number(row.avg_max_gain_percent),
  }));

  return NextResponse.json({ ruggers, page: safePage, pageSize: safePageSize, total });
}

export async function POST(req: NextRequest) {
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
    const countRows = await query<{ count: string }>(`select count(*)::text as count from ruggers`, []);
    const count = Number(countRows[0]?.count ?? '0');
    name = String(count + 1);
  }

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
    created_at: string;
  }>(
    `
      insert into ruggers (name, description, wallet_address, wallet_type, volume_min, volume_max, start_hour, end_hour, notes)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning id, name, description, wallet_address, wallet_type, volume_min, volume_max, start_hour, end_hour, notes, created_at
    `,
    [name, description, walletAddress, walletType, volumeMin, volumeMax, startHour, endHour, notes]
  );

  const row = rows[0];

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
    createdAt: row.created_at,
    tokenCount: 0,
    avgMaxGainPercent: 0,
  };

  return NextResponse.json(rugger, { status: 201 });
}

