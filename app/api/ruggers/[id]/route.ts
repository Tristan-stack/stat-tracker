import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { Rugger, WalletType } from '@/types/rugger';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: ruggerId } = await context.params;

  const rows = await query<{
    id: string;
    name: string | null;
    description: string | null;
    wallet_address: string;
    wallet_type: WalletType;
    volume_min: number | null;
    volume_max: number | null;
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
        r.created_at,
        (select count(*)::int from rugger_tokens t where t.rugger_id = r.id) as token_count,
        (select coalesce(avg((t.high - t.entry_price) / nullif(t.entry_price, 0) * 100), 0) from rugger_tokens t where t.rugger_id = r.id) as avg_max_gain_percent
      from ruggers r
      where r.id = $1
    `,
    [ruggerId]
  );

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const rugger: Rugger = {
    id: row.id,
    name: row.name,
    description: row.description,
    walletAddress: row.wallet_address,
    walletType: row.wallet_type,
    volumeMin: row.volume_min ?? null,
    volumeMax: row.volume_max ?? null,
    createdAt: row.created_at,
    tokenCount: row.token_count,
    avgMaxGainPercent: Number(row.avg_max_gain_percent),
  };

  return NextResponse.json(rugger);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: ruggerId } = await context.params;
  const body = (await req.json()) as {
    name?: string | null;
    description?: string | null;
    walletAddress?: string;
    walletType?: WalletType;
    volumeMin?: number | null;
    volumeMax?: number | null;
  };

  const walletType = body.walletType;
  if (walletType !== undefined && !['exchange', 'mother', 'simple'].includes(walletType)) {
    return NextResponse.json({ error: 'Invalid walletType' }, { status: 400 });
  }

  const existing = await query<{ id: string }>('select id from ruggers where id = $1', [ruggerId]);
  if (existing.length === 0) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const updates: string[] = [];
  const values: (string | number | null)[] = [];
  let paramIndex = 1;

  if (body.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(body.name?.trim() || null);
  }
  if (body.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(body.description?.trim() || null);
  }
  if (body.walletAddress !== undefined) {
    const trimmed = body.walletAddress.trim();
    if (trimmed === '') {
      return NextResponse.json({ error: 'walletAddress cannot be empty' }, { status: 400 });
    }
    updates.push(`wallet_address = $${paramIndex++}`);
    values.push(trimmed);
  }
  if (body.walletType !== undefined) {
    updates.push(`wallet_type = $${paramIndex++}`);
    values.push(body.walletType);
  }
  const toNum = (v: unknown): number | null =>
    v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  if (body.volumeMin !== undefined) {
    updates.push(`volume_min = $${paramIndex++}`);
    values.push(toNum(body.volumeMin));
  }
  if (body.volumeMax !== undefined) {
    updates.push(`volume_max = $${paramIndex++}`);
    values.push(toNum(body.volumeMax));
  }

  if (updates.length === 0) {
    const row = await query<{
      id: string;
      name: string | null;
      description: string | null;
      wallet_address: string;
      wallet_type: WalletType;
      volume_min: number | null;
      volume_max: number | null;
      created_at: string;
      token_count: number;
      avg_max_gain_percent: number;
    }>(
      `select r.id, r.name, r.description, r.wallet_address, r.wallet_type, r.volume_min, r.volume_max, r.created_at,
        (select count(*)::int from rugger_tokens t where t.rugger_id = r.id) as token_count,
        (select coalesce(avg((t.high - t.entry_price) / nullif(t.entry_price, 0) * 100), 0) from rugger_tokens t where t.rugger_id = r.id) as avg_max_gain_percent
       from ruggers r where r.id = $1`,
      [ruggerId]
    );
    const r = row[0];
    if (!r) return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
    return NextResponse.json({
      id: r.id,
      name: r.name,
      description: r.description,
      walletAddress: r.wallet_address,
      walletType: r.wallet_type,
      volumeMin: r.volume_min ?? null,
      volumeMax: r.volume_max ?? null,
      createdAt: r.created_at,
      tokenCount: r.token_count,
      avgMaxGainPercent: Number(r.avg_max_gain_percent),
    });
  }

  values.push(ruggerId);
  const setClause = updates.join(', ');
  const rows = await query<{
    id: string;
    name: string | null;
    description: string | null;
    wallet_address: string;
    wallet_type: WalletType;
    volume_min: number | null;
    volume_max: number | null;
    created_at: string;
    token_count: number;
    avg_max_gain_percent: number;
  }>(
    `update ruggers set ${setClause} where id = $${paramIndex}
     returning id, name, description, wallet_address, wallet_type, volume_min, volume_max, created_at,
       (select count(*)::int from rugger_tokens t where t.rugger_id = ruggers.id) as token_count,
       (select coalesce(avg((t.high - t.entry_price) / nullif(t.entry_price, 0) * 100), 0) from rugger_tokens t where t.rugger_id = ruggers.id) as avg_max_gain_percent`,
    values
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });

  const updated: Rugger = {
    id: row.id,
    name: row.name,
    description: row.description,
    walletAddress: row.wallet_address,
    walletType: row.wallet_type,
    volumeMin: row.volume_min ?? null,
    volumeMax: row.volume_max ?? null,
    createdAt: row.created_at,
    tokenCount: row.token_count,
    avgMaxGainPercent: Number(row.avg_max_gain_percent),
  };
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: ruggerId } = await context.params;

  const existing = await query<{ id: string }>('select id from ruggers where id = $1', [ruggerId]);
  if (existing.length === 0) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  await query('delete from rugger_tokens where rugger_id = $1', [ruggerId]);
  await query('delete from ruggers where id = $1', [ruggerId]);

  return NextResponse.json({ ok: true });
}
