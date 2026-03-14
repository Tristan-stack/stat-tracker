import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { Token } from '@/types/token';
import type { StatusId } from '@/types/rugger';

const CREATED_SINCE_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '1mo': 30 * 24 * 60 * 60 * 1000,
};

function getCreatedSinceCutoff(createdSince: string | null): string | null {
  if (!createdSince || !(createdSince in CREATED_SINCE_MS)) return null;
  const date = new Date(Date.now() - CREATED_SINCE_MS[createdSince]);
  return date.toISOString();
}

interface DbToken {
  id: string;
  rugger_id: string;
  name: string;
  entry_price: number;
  high: number;
  low: number;
  target_exit_percent: number;
  status_id: StatusId;
  created_at: string;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: ruggerId } = await context.params;
  const { searchParams } = new URL(req.url);
  const fetchAll = searchParams.get('all') === 'true';
  const statusFilter = searchParams.get('status') as StatusId | null;
  const createdSinceParam = searchParams.get('createdSince');
  const createdSinceCutoff = getCreatedSinceCutoff(createdSinceParam);
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '10');
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 10;
  const offset = (safePage - 1) * safePageSize;

  const conditions: string[] = ['rugger_id = $1'];
  const baseParams: (string | number)[] = [ruggerId];
  if (statusFilter) {
    conditions.push('status_id = $' + (baseParams.length + 1));
    baseParams.push(statusFilter);
  }
  if (createdSinceCutoff) {
    conditions.push('created_at >= $' + (baseParams.length + 1));
    baseParams.push(createdSinceCutoff);
  }
  const whereClause = 'where ' + conditions.join(' and ');

  const countRows = await query<{ count: string }>(
    `select count(*)::text as count from rugger_tokens ${whereClause}`,
    baseParams
  );
  const total = Number(countRows[0]?.count ?? '0');

  const selectCols = 'id, rugger_id, name, entry_price, high, low, target_exit_percent, status_id, created_at';
  const rows = fetchAll
    ? await query<DbToken>(
        `select ${selectCols} from rugger_tokens ${whereClause} order by created_at desc`,
        baseParams
      )
    : await query<DbToken>(
        `select ${selectCols} from rugger_tokens ${whereClause} order by created_at desc limit $${baseParams.length + 1} offset $${baseParams.length + 2}`,
        [...baseParams, safePageSize, offset]
      );

  let allSameTargetPercent: number | null = null;
  if (total > 0) {
    const distinctRows = await query<{ target_exit_percent: number }>(
      `select distinct target_exit_percent from rugger_tokens ${whereClause}`,
      baseParams
    );
    if (distinctRows.length === 1) {
      allSameTargetPercent = distinctRows[0].target_exit_percent;
    }
  }

  const tokens: Token[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    entryPrice: row.entry_price,
    high: row.high,
    low: row.low,
    targetExitPercent: row.target_exit_percent,
    statusId: row.status_id,
  }));

  return NextResponse.json({
    tokens,
    page: fetchAll ? 1 : safePage,
    pageSize: fetchAll ? total : safePageSize,
    total,
    allSameTargetPercent,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: ruggerId } = await context.params;
  const body = (await req.json()) as { tokens?: Token[]; replace?: boolean };
  const payload = body.tokens ?? [];
  const replace = body.replace !== false;

  if (!Array.isArray(payload) || payload.length === 0) {
    return NextResponse.json({ error: 'No tokens provided' }, { status: 400 });
  }

  const cleaned = payload.filter((item): item is Token => {
    if (typeof item !== 'object' || item === null) return false;
    const candidate = item as Token;
    return (
      typeof candidate.name === 'string' &&
      typeof candidate.entryPrice === 'number' &&
      typeof candidate.high === 'number' &&
      typeof candidate.low === 'number' &&
      typeof candidate.targetExitPercent === 'number'
    );
  });

  if (cleaned.length === 0) {
    return NextResponse.json({ error: 'No valid tokens' }, { status: 400 });
  }

  const ruggerRows = await query<{ status_id: StatusId }>('select status_id from ruggers where id = $1', [ruggerId]);
  const ruggerStatusId = ruggerRows[0]?.status_id ?? 'verification';

  if (replace) {
    await query('delete from rugger_tokens where rugger_id = $1', [ruggerId]);
  }

  const rowsToInsert: (string | number)[] = [];
  const placeholders: string[] = [];
  cleaned.forEach((token, index) => {
    const base = index * 8;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`
    );
    rowsToInsert.push(
      crypto.randomUUID(),
      ruggerId,
      token.name,
      token.entryPrice,
      token.high,
      token.low,
      token.targetExitPercent,
      ruggerStatusId
    );
  });

  await query<DbToken>(
    `
      insert into rugger_tokens
        (id, rugger_id, name, entry_price, high, low, target_exit_percent, status_id)
      values ${placeholders.join(', ')}
    `,
    rowsToInsert
  );

  return NextResponse.json({ count: cleaned.length }, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: ruggerId } = await context.params;
  const body = (await req.json()) as { targetExitPercent?: number };
  const targetExitPercent = body.targetExitPercent;

  if (
    typeof targetExitPercent !== 'number' ||
    !Number.isFinite(targetExitPercent)
  ) {
    return NextResponse.json(
      { error: 'targetExitPercent must be a number' },
      { status: 400 }
    );
  }

  await query(
    'update rugger_tokens set target_exit_percent = $1 where rugger_id = $2',
    [targetExitPercent, ruggerId]
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: ruggerId } = await context.params;
  await query('delete from rugger_tokens where rugger_id = $1', [ruggerId]);
  return NextResponse.json({ ok: true });
}

