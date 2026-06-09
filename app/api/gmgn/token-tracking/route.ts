import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { badRequest } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { buildTokenTrackingPreviews } from '@/lib/gmgn/token-tracking';

const MAX_TOKENS = 30;
const MAX_SPAN_MS = 366 * 86400000;

function normalizeTokenList(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const a = raw.trim();
    if (a === '' || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
  }
  return out;
}

const schema = z.object({
  tokenAddress: z.string().optional(),
  tokenAddresses: z.array(z.string()).optional(),
  fromMs: z.number().optional(),
  toMs: z.number().optional(),
  athHigh: z.boolean().optional(),
});

export const POST = withAuth(async (req) => {
  const body = await parseBody(req, schema);

  const fromMs = body.fromMs ?? NaN;
  const toMs = body.toMs ?? NaN;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    throw badRequest('fromMs and toMs must be finite numbers with fromMs <= toMs');
  }
  if (toMs - fromMs > MAX_SPAN_MS) throw badRequest('Date range too large');

  const tokenList =
    body.tokenAddresses && body.tokenAddresses.length > 0
      ? normalizeTokenList(body.tokenAddresses)
      : body.tokenAddress && body.tokenAddress.trim() !== ''
        ? [body.tokenAddress.trim()]
        : [];

  if (tokenList.length === 0) throw badRequest('tokenAddress or tokenAddresses is required');
  if (tokenList.length > MAX_TOKENS) throw badRequest(`Too many tokens (max ${MAX_TOKENS})`);

  try {
    const purchases = await buildTokenTrackingPreviews(tokenList, fromMs, toMs, { athHigh: body.athHigh === true });
    return ok({ purchases });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'GMGN request failed';
    const status = /HTTP 401\b/.test(message)
      ? 401
      : /HTTP 403\b/.test(message)
        ? 403
        : /HTTP 429\b/.test(message)
          ? 429
          : 502;
    return NextResponse.json({ error: message }, { status });
  }
});
