import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { badRequest } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { resolveDexPaidByMint } from '@/lib/dexscreener/paid';
import type { DexPaidEntry } from '@/types/dex-paid';

/** Endpoint orders Dexscreener = 1 requête/mint (throttlé) : on borne la liste. */
const MAX_MINTS = 60;

function normalizeMintList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const m = x.trim();
    if (m === '' || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
    if (out.length >= MAX_MINTS) break;
  }
  return out;
}

export const POST = withAuth(async (req) => {
  const body = await parseBody(req, z.object({ tokenAddresses: z.array(z.unknown()).optional() }));
  const tokenAddresses = normalizeMintList(body.tokenAddresses);
  if (tokenAddresses.length === 0) {
    throw badRequest('tokenAddresses must be a non-empty array of strings');
  }

  const byMint = await resolveDexPaidByMint(tokenAddresses);
  return ok({ byMint: byMint as Record<string, DexPaidEntry> });
});
