import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { Token } from '@/types/token';

interface DbToken {
  id: string;
  rugger_id: string;
  name: string;
  entry_price: number;
  high: number;
  low: number;
  target_exit_percent: number;
  created_at: string;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: ruggerId } = await context.params;
  const { searchParams } = new URL(req.url);
  const fetchAll = searchParams.get('all') === 'true';
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '10');
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 10;
  const offset = (safePage - 1) * safePageSize;

  const countRows = await query<{ count: string }>(
    'select count(*)::text as count from rugger_tokens where rugger_id = $1',
    [ruggerId]
  );
  const total = Number(countRows[0]?.count ?? '0');

  const rows = fetchAll
    ? await query<DbToken>(
        `
          select id, rugger_id, name, entry_price, high, low, target_exit_percent, created_at
          from rugger_tokens
          where rugger_id = $1
          order by created_at desc
        `,
        [ruggerId]
      )
    : await query<DbToken>(
        `
          select id, rugger_id, name, entry_price, high, low, target_exit_percent, created_at
          from rugger_tokens
          where rugger_id = $1
          order by created_at desc
          limit $2 offset $3
        `,
        [ruggerId, safePageSize, offset]
      );

  let allSameTargetPercent: number | null = null;
  if (total > 0) {
    const distinctRows = await query<{ target_exit_percent: number }>(
      'select distinct target_exit_percent from rugger_tokens where rugger_id = $1',
      [ruggerId]
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

  if (replace) {
    await query('delete from rugger_tokens where rugger_id = $1', [ruggerId]);
  }

  const rowsToInsert: (string | number)[] = [];
  const placeholders: string[] = [];
  cleaned.forEach((token, index) => {
    const base = index * 7;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`
    );
    rowsToInsert.push(
      crypto.randomUUID(),
      ruggerId,
      token.name,
      token.entryPrice,
      token.high,
      token.low,
      token.targetExitPercent
    );
  });

  await query<DbToken>(
    `
      insert into rugger_tokens
        (id, rugger_id, name, entry_price, high, low, target_exit_percent)
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

