import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireUser } from '@/lib/auth-session';
import { ruggerExistsForUser } from '@/lib/rugger-access';

type RuggerTokenPatchBody = {
  targetExitPercent?: number;
  entryPrice?: number;
  high?: number;
  low?: number;
  purchasedAt?: string | null;
  tokenAddress?: string | null;
  name?: string;
  tokenName?: string | null;
  entryToLowMinutes?: number | null;
};

function isMissingEntryToLowColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/entry_to_low/i.test(msg)) return false;
  const code =
    err !== null && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  if (code === '42703') return true;
  return /does not exist|undefined_column|42703/i.test(msg);
}

/** Construit SET … pour `rugger_tokens` ; `omitEntryToLow` si la colonne n’existe pas encore en base. */
function buildRuggerTokenPatchParts(
  body: RuggerTokenPatchBody,
  opts?: { omitEntryToLow?: boolean }
): NextResponse | { clauses: string[]; values: (number | string | null)[]; nextParam: number } {
  const setClauses: string[] = [];
  const values: (number | string | null)[] = [];
  let paramIndex = 1;

  if (body.targetExitPercent !== undefined) {
    if (typeof body.targetExitPercent !== 'number' || !Number.isFinite(body.targetExitPercent)) {
      return NextResponse.json({ error: 'targetExitPercent must be a number' }, { status: 400 });
    }
    setClauses.push(`target_exit_percent = $${paramIndex++}`);
    values.push(body.targetExitPercent);
  }

  if (body.entryPrice !== undefined) {
    if (typeof body.entryPrice !== 'number' || !Number.isFinite(body.entryPrice) || body.entryPrice < 0) {
      return NextResponse.json({ error: 'entryPrice must be a non-negative number' }, { status: 400 });
    }
    setClauses.push(`entry_price = $${paramIndex++}`);
    values.push(body.entryPrice);
  }

  if (body.high !== undefined) {
    if (typeof body.high !== 'number' || !Number.isFinite(body.high) || body.high < 0) {
      return NextResponse.json({ error: 'high must be a non-negative number' }, { status: 400 });
    }
    setClauses.push(`high = $${paramIndex++}`);
    values.push(body.high);
  }

  if (body.low !== undefined) {
    if (typeof body.low !== 'number' || !Number.isFinite(body.low) || body.low < 0) {
      return NextResponse.json({ error: 'low must be a non-negative number' }, { status: 400 });
    }
    setClauses.push(`low = $${paramIndex++}`);
    values.push(body.low);
  }

  if (body.purchasedAt !== undefined) {
    if (body.purchasedAt === null || body.purchasedAt === '') {
      setClauses.push(`purchased_at = $${paramIndex++}`);
      values.push(null);
    } else if (typeof body.purchasedAt === 'string') {
      const d = new Date(body.purchasedAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: 'purchasedAt must be a valid ISO date string' }, { status: 400 });
      }
      setClauses.push(`purchased_at = $${paramIndex++}`);
      values.push(d.toISOString());
    } else {
      return NextResponse.json({ error: 'purchasedAt invalid' }, { status: 400 });
    }
  }

  if (body.tokenAddress !== undefined) {
    if (body.tokenAddress === null || body.tokenAddress === '') {
      setClauses.push(`token_address = $${paramIndex++}`);
      values.push(null);
    } else if (typeof body.tokenAddress === 'string') {
      setClauses.push(`token_address = $${paramIndex++}`);
      values.push(body.tokenAddress.trim());
    } else {
      return NextResponse.json({ error: 'tokenAddress invalid' }, { status: 400 });
    }
  }

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 });
    }
    setClauses.push(`name = $${paramIndex++}`);
    values.push(body.name.trim());
  }

  if (body.tokenName !== undefined) {
    if (body.tokenName === null || body.tokenName === '') {
      setClauses.push(`token_name = $${paramIndex++}`);
      values.push(null);
    } else if (typeof body.tokenName === 'string') {
      setClauses.push(`token_name = $${paramIndex++}`);
      values.push(body.tokenName.trim());
    } else {
      return NextResponse.json({ error: 'tokenName invalid' }, { status: 400 });
    }
  }

  if (!opts?.omitEntryToLow && body.entryToLowMinutes !== undefined) {
    if (body.entryToLowMinutes === null) {
      setClauses.push(`entry_to_low_minutes = $${paramIndex++}`);
      values.push(null);
    } else if (typeof body.entryToLowMinutes === 'number' && Number.isFinite(body.entryToLowMinutes)) {
      setClauses.push(`entry_to_low_minutes = $${paramIndex++}`);
      values.push(body.entryToLowMinutes);
    } else {
      return NextResponse.json({ error: 'entryToLowMinutes must be a finite number or null' }, { status: 400 });
    }
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  return { clauses: setClauses, values, nextParam: paramIndex };
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; tokenId: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, tokenId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const body = (await req.json()) as RuggerTokenPatchBody;

  const runUpdate = async (omitEntryToLow: boolean) => {
    const built = buildRuggerTokenPatchParts(body, { omitEntryToLow });
    if (built instanceof NextResponse) return { error: built as NextResponse };
    const { clauses, values, nextParam } = built;
    const idParam = nextParam;
    const ruggerParam = nextParam + 1;
    const execValues = [...values, tokenId, ruggerId];
    const sql = `update rugger_tokens set ${clauses.join(', ')} where id = $${idParam} and rugger_id = $${ruggerParam} returning id`;
    const rows = await query<{ id: string }>(sql, execValues);
    return { rows };
  };

  try {
    const first = await runUpdate(false);
    if ('error' in first) return first.error;
    if (first.rows.length === 0) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (!isMissingEntryToLowColumnError(e) || body.entryToLowMinutes === undefined) {
      console.error('[PATCH rugger token]', e);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    try {
      const second = await runUpdate(true);
      if ('error' in second) return second.error;
      if (second.rows.length === 0) {
        return NextResponse.json({ error: 'Token not found' }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        warning:
          'Colonne entry_to_low_minutes absente : high/low mis à jour. Exécutez `npx prisma migrate dev` pour activer les métriques klines associées.',
      });
    } catch (e2) {
      console.error('[PATCH rugger token retry]', e2);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; tokenId: string }> }
) {
  const auth = await requireUser(_req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, tokenId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  await query(
    'delete from rugger_tokens where id = $1 and rugger_id = $2',
    [tokenId, ruggerId]
  );
  return NextResponse.json({ ok: true });
}
