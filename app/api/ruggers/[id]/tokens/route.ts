import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok, created } from '@/lib/api/responses';
import { badRequest, notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import {
  listTokens,
  getRuggerStatusId,
  deleteAllTokens,
  bulkInsertTokens,
  setTargetExitPercentForRugger,
  setTargetExitMcapForRugger,
  type TokenListFilters,
} from '@/features/ruggers/tokens-repository';
import type { Token } from '@/types/token';
import type { StatusId } from '@/types/rugger';

type Ctx = { params: Promise<{ id: string }> };

function parseIso(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseMcap(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isValidToken(item: unknown): item is Token {
  if (typeof item !== 'object' || item === null) return false;
  const c = item as Token;
  return (
    typeof c.name === 'string' &&
    typeof c.entryPrice === 'number' &&
    typeof c.high === 'number' &&
    typeof c.low === 'number' &&
    typeof c.targetExitPercent === 'number'
  );
}

export const GET = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');

  const sp = new URL(req.url).searchParams;
  const fetchAll = sp.get('all') === 'true';
  const page = Number(sp.get('page') ?? '1');
  const pageSize = Number(sp.get('pageSize') ?? '10');
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 10;

  const filters: TokenListFilters = {
    status: sp.get('status') as StatusId | null,
    dateFromIso: parseIso(sp.get('tokenDateFrom')),
    dateToIso: parseIso(sp.get('tokenDateTo')),
    entryMcapMin: parseMcap(sp.get('entryMcapMin')),
    entryMcapMax: parseMcap(sp.get('entryMcapMax')),
    migrationOnly: sp.get('migration') === 'true',
  };

  const { tokens, total, allSameTargetPercent } = await listTokens({
    ruggerId,
    filters,
    fetchAll,
    page: safePage,
    pageSize: safePageSize,
  });

  return ok({
    tokens,
    page: fetchAll ? 1 : safePage,
    pageSize: fetchAll ? total : safePageSize,
    total,
    allSameTargetPercent,
  });
});

const createSchema = z.object({
  tokens: z.array(z.unknown()).optional(),
  replace: z.boolean().optional(),
});

export const POST = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');

  const body = await parseBody(req, createSchema);
  const payload = body.tokens ?? [];
  const replace = body.replace !== false;

  if (payload.length === 0) throw badRequest('No tokens provided');
  const cleaned = payload.filter(isValidToken);
  if (cleaned.length === 0) throw badRequest('No valid tokens');

  const statusId = await getRuggerStatusId(ruggerId, userId);
  if (replace) await deleteAllTokens(ruggerId);
  const count = await bulkInsertTokens(ruggerId, statusId, cleaned);

  return created({ count });
});

const patchSchema = z.object({
  targetExitPercent: z.number().optional(),
  targetExitMcap: z.number().optional(),
});

export const PATCH = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');

  const body = await parseBody(req, patchSchema);

  if (body.targetExitMcap !== undefined) {
    if (!Number.isFinite(body.targetExitMcap) || body.targetExitMcap <= 0) {
      throw badRequest('targetExitMcap must be a positive number');
    }
    await setTargetExitMcapForRugger(ruggerId, body.targetExitMcap);
    return ok({ ok: true });
  }

  if (body.targetExitPercent === undefined || !Number.isFinite(body.targetExitPercent)) {
    throw badRequest('targetExitPercent or targetExitMcap required');
  }
  await setTargetExitPercentForRugger(ruggerId, body.targetExitPercent);
  return ok({ ok: true });
});

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');
  await deleteAllTokens(ruggerId);
  return ok({ ok: true });
});
