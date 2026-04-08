import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-session';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { MIGRATION_MCAP_THRESHOLD } from '@/lib/migration';
import type { Token } from '@/types/token';
import type { StatusId } from '@/types/rugger';

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
  purchased_at: string | null;
  token_address: string | null;
  token_name: string | null;
}

function parseOptionalIsoToParam(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v.trim() === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const fetchAll = searchParams.get('all') === 'true';
  const statusFilter = searchParams.get('status') as StatusId | null;
  const tokenDateFrom = searchParams.get('tokenDateFrom');
  const tokenDateTo = searchParams.get('tokenDateTo');
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
  const effectiveTsExpr = 'coalesce(purchased_at, created_at)';
  if (tokenDateFrom) {
    const d = new Date(tokenDateFrom);
    if (!Number.isNaN(d.getTime())) {
      conditions.push(`${effectiveTsExpr} >= $` + (baseParams.length + 1));
      baseParams.push(d.toISOString());
    }
  }
  if (tokenDateTo) {
    const d = new Date(tokenDateTo);
    if (!Number.isNaN(d.getTime())) {
      conditions.push(`${effectiveTsExpr} <= $` + (baseParams.length + 1));
      baseParams.push(d.toISOString());
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

  const selectCols =
    'id, rugger_id, name, entry_price, high, low, target_exit_percent, status_id, created_at, purchased_at, token_address, token_name';
  const orderBy = `order by coalesce(purchased_at, created_at) desc`;
  const rows = fetchAll
    ? await query<DbToken>(
        `select ${selectCols} from rugger_tokens ${whereClause} ${orderBy}`,
        baseParams
      )
    : await query<DbToken>(
        `select ${selectCols} from rugger_tokens ${whereClause} ${orderBy} limit $${baseParams.length + 1} offset $${baseParams.length + 2}`,
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

  const tokens: Token[] = rows.map((row) => {
    const t: Token = {
      id: row.id,
      name: row.name,
      entryPrice: row.entry_price,
      high: row.high,
      low: row.low,
      targetExitPercent: row.target_exit_percent,
      statusId: row.status_id,
    };
    if (row.purchased_at) t.purchasedAt = new Date(row.purchased_at).toISOString();
    if (row.token_address) t.tokenAddress = row.token_address;
    if (row.token_name) t.tokenName = row.token_name;
    return t;
  });

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
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

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

  const ruggerRows = await query<{ status_id: StatusId }>(
    'select status_id from ruggers where id = $1 and user_id = $2',
    [ruggerId, userId]
  );
  const ruggerStatusId = ruggerRows[0]?.status_id ?? 'verification';

  if (replace) {
    await query('delete from rugger_tokens where rugger_id = $1', [ruggerId]);
  }

  const rowsToInsert: (string | number | null)[] = [];
  const placeholders: string[] = [];
  cleaned.forEach((token, index) => {
    const base = index * 11;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`
    );
    const purchasedIso = parseOptionalIsoToParam(token.purchasedAt);
    const tokenAddr =
      typeof token.tokenAddress === 'string' && token.tokenAddress.trim() !== ''
        ? token.tokenAddress.trim()
        : null;
    const tokenLabel =
      typeof token.tokenName === 'string' && token.tokenName.trim() !== ''
        ? token.tokenName.trim()
        : null;
    rowsToInsert.push(
      crypto.randomUUID(),
      ruggerId,
      token.name,
      token.entryPrice,
      token.high,
      token.low,
      token.targetExitPercent,
      ruggerStatusId,
      purchasedIso,
      tokenAddr,
      tokenLabel
    );
  });

  await query<DbToken>(
    `
      insert into rugger_tokens
        (id, rugger_id, name, entry_price, high, low, target_exit_percent, status_id, purchased_at, token_address, token_name)
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
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

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
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  await query('delete from rugger_tokens where rugger_id = $1', [ruggerId]);
  return NextResponse.json({ ok: true });
}
