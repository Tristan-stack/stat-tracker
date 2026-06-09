import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { ApiError, badRequest } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { computeWalletPnl } from '@/lib/pnl/compute-wallet-pnl';
import { computeBalanceDeltaPnl } from '@/lib/pnl/compute-balance-delta-pnl';
import { fetchWalletBalance } from '@/lib/pnl/wallet-balance';
import type { PnlComputeResponse, PnlMethod, PnlRangePreset } from '@/types/pnl';

export const maxDuration = 60;

const VALID_PRESETS: PnlRangePreset[] = ['today', '1d', '7d', '30d', 'day', 'custom'];
const VALID_METHODS: PnlMethod[] = ['gmgn', 'balance_delta'];

const computeSchema = z.object({
  walletAddress: z.string().trim().min(1, 'walletAddress is required'),
  fromMs: z.number(),
  toMs: z.number(),
  preset: z.string().optional(),
  method: z.string().optional(),
  includeBalance: z.boolean().optional(),
});

export const POST = withAuth(async (req) => {
  const body = await parseBody(req, computeSchema);

  const walletAddress = body.walletAddress;
  const { fromMs, toMs } = body;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    throw badRequest('Plage de dates invalide');
  }
  const preset: PnlRangePreset = VALID_PRESETS.includes(body.preset as PnlRangePreset)
    ? (body.preset as PnlRangePreset)
    : 'custom';
  const method: PnlMethod = VALID_METHODS.includes(body.method as PnlMethod)
    ? (body.method as PnlMethod)
    : 'gmgn';
  const includeBalance = body.includeBalance !== false;

  // Méthode on-chain : PNL = delta de solde SOL sur la période (Helius).
  if (method === 'balance_delta') {
    try {
      const delta = await computeBalanceDeltaPnl(walletAddress, fromMs, toMs);
      const response: PnlComputeResponse = {
        walletAddress,
        fromMs,
        toMs,
        pnl: delta.result,
        balance: includeBalance ? delta.balance : null,
        solUsd: delta.solUsd,
        warnings: delta.warnings,
        startBalanceSol: delta.startBalanceSol,
        endBalanceSol: delta.endBalanceSol,
      };
      return ok(response);
    } catch (e) {
      console.error('[POST /api/pnl/compute] balance_delta', e);
      throw new ApiError(502, 'Échec du calcul PNL (delta de balance)');
    }
  }

  const warnings: string[] = [];

  const [pnlSettled, balanceSettled] = await Promise.allSettled([
    computeWalletPnl(walletAddress, fromMs, toMs, preset),
    includeBalance ? fetchWalletBalance(walletAddress) : Promise.resolve(null),
  ]);

  if (pnlSettled.status === 'rejected') {
    console.error('[POST /api/pnl/compute] pnl', pnlSettled.reason);
    throw new ApiError(502, 'Échec du calcul PNL');
  }

  const { result, warnings: pnlWarnings, solUsd } = pnlSettled.value;
  warnings.push(...pnlWarnings);

  let balance = null;
  if (balanceSettled.status === 'fulfilled') {
    balance = balanceSettled.value;
  } else if (includeBalance) {
    warnings.push('Balance indisponible (Helius).');
  }

  const response: PnlComputeResponse = {
    walletAddress,
    fromMs,
    toMs,
    pnl: result,
    balance,
    solUsd: solUsd ?? balance?.solUsd ?? null,
    warnings,
  };
  return ok(response);
});
