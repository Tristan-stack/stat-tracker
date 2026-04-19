import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-session';
import { RUGGER_LIST_SELECT, RUGGER_METRICS_RETURNING } from '@/lib/repositories/rugger-queries';
import type { Rugger, WalletType, StatusId } from '@/types/rugger';
import { STATUS_ORDER } from '@/types/rugger';

interface RuggerRow {
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

function toRugger(r: RuggerRow): Rugger {
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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;

  const rows = await query<RuggerRow>(
    `${RUGGER_LIST_SELECT} where r.id = $1 and r.user_id = $2`,
    [ruggerId, userId]
  );

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  return NextResponse.json(toRugger(row));
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  const body = (await req.json()) as {
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
  };

  const walletType = body.walletType;
  if (walletType !== undefined && !['exchange', 'mother', 'simple', 'buyer'].includes(walletType)) {
    return NextResponse.json({ error: 'Invalid walletType' }, { status: 400 });
  }

  const existing = await query<{ id: string; status_id: StatusId }>(
    'select id, status_id from ruggers where id = $1 and user_id = $2',
    [ruggerId, userId]
  );
  if (existing.length === 0) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  if (body.statusId !== undefined) {
    const nextOrder = STATUS_ORDER.indexOf(body.statusId);
    if (nextOrder < 0) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
  }

  const updates: string[] = [];
  const values: (string | number | boolean | null)[] = [];
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
    updates.push(`wallet_address = $${paramIndex++}`);
    if (body.walletAddress === null) {
      values.push(null);
    } else {
      const trimmed = body.walletAddress.trim();
      values.push(trimmed === '' ? null : trimmed);
    }
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
  const toHour = (v: unknown): number | null => {
    const n = toNum(v);
    return n != null && n >= 0 && n <= 23 ? n : null;
  };
  if (body.startHour !== undefined) {
    updates.push(`start_hour = $${paramIndex++}`);
    values.push(toHour(body.startHour));
  }
  if (body.endHour !== undefined) {
    updates.push(`end_hour = $${paramIndex++}`);
    values.push(toHour(body.endHour));
  }
  if (body.notes !== undefined) {
    updates.push(`notes = $${paramIndex++}`);
    values.push(typeof body.notes === 'string' ? (body.notes.trim() || null) : null);
  }
  if (body.statusId !== undefined) {
    updates.push(`status_id = $${paramIndex++}`);
    values.push(body.statusId);
  }
  if (body.archived !== undefined) {
    updates.push(`archived = $${paramIndex++}`);
    values.push(body.archived);
  }

  if (updates.length === 0) {
    const row = await query<RuggerRow>(`${RUGGER_LIST_SELECT} where r.id = $1 and r.user_id = $2`, [
      ruggerId,
      userId,
    ]);
    const r = row[0];
    if (!r) return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
    return NextResponse.json(toRugger(r));
  }

  values.push(ruggerId, userId);
  const setClause = updates.join(', ');
  const rows = await query<RuggerRow>(
    `update ruggers set ${setClause} where id = $${paramIndex++} and user_id = $${paramIndex}
     returning id, name, description, wallet_address, wallet_type, volume_min, volume_max, start_hour, end_hour, notes, status_id, archived, created_at,
       ${RUGGER_METRICS_RETURNING}`,
    values
  );

  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  return NextResponse.json(toRugger(row));
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;

  const existing = await query<{ id: string }>(
    'select id from ruggers where id = $1 and user_id = $2',
    [ruggerId, userId]
  );
  if (existing.length === 0) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  await query('delete from rugger_tokens where rugger_id = $1', [ruggerId]);
  await query('delete from ruggers where id = $1 and user_id = $2', [ruggerId, userId]);

  return NextResponse.json({ ok: true });
}
