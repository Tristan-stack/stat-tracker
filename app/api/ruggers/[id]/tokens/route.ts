import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { MIGRATION_MCAP_THRESHOLD } from '@/lib/migration';
import type { Token } from '@/types/token';
import type { StatusId } from '@/types/rugger';

const CREATED_SINCE_DAYS: Record<string, number> = {
  today: 0,
  '24h': 1,
  '3d': 3,
  '7d': 7,
  '1mo': 30,
};

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getCreatedSinceBounds(createdSince: string | null): { from: string; to?: string } | null {
  if (!createdSince || !(createdSince in CREATED_SINCE_DAYS)) return null;

  const days = CREATED_SINCE_DAYS[createdSince];
  const todayStart = startOfLocalDay(new Date());
  const from = new Date(todayStart);
  from.setDate(from.getDate() - days);

  const bounds: { from: string; to?: string } = { from: from.toISOString() };

  if (createdSince === 'today') {
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    bounds.to = tomorrowStart.toISOString();
    return bounds;
  }

  // Calendar-day filters: exclude "today" to match "yesterday/last N days".
  bounds.to = todayStart.toISOString();

  return bounds;
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
  const createdSinceBounds = getCreatedSinceBounds(createdSinceParam);
  const migrationOnly = searchParams.get('migration') === 'true';
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
  if (createdSinceBounds) {
    conditions.push('created_at >= $' + (baseParams.length + 1));
    baseParams.push(createdSinceBounds.from);
    if (createdSinceBounds.to) {
      conditions.push('created_at < $' + (baseParams.length + 1));
      baseParams.push(createdSinceBounds.to);
    }
  }
  if (migrationOnly) {
    conditions.push('high >= $' + (baseParams.length + 1));
    baseParams.push(MIGRATION_MCAP_THRESHOLD);
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
  const body = (await req.json()) as { targetExitPercent?: number; targetExitMcap?: number };

  if (body.targetExitMcap !== undefined) {
    if (typeof body.targetExitMcap !== 'number' || !Number.isFinite(body.targetExitMcap) || body.targetExitMcap <= 0) {
      return NextResponse.json({ error: 'targetExitMcap must be a positive number' }, { status: 400 });
    }
    await query(
      'update rugger_tokens set target_exit_percent = (($1 / entry_price) - 1) * 100 where rugger_id = $2 and entry_price > 0',
      [body.targetExitMcap, ruggerId]
    );
    return NextResponse.json({ ok: true });
  }

  if (typeof body.targetExitPercent !== 'number' || !Number.isFinite(body.targetExitPercent)) {
    return NextResponse.json({ error: 'targetExitPercent or targetExitMcap required' }, { status: 400 });
  }

  await query(
    'update rugger_tokens set target_exit_percent = $1 where rugger_id = $2',
    [body.targetExitPercent, ruggerId]
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

