import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { computeWalletPnl } from '@/lib/pnl/compute-wallet-pnl';
import { computeBalanceDeltaPnl } from '@/lib/pnl/compute-balance-delta-pnl';
import { fetchWalletBalance } from '@/lib/pnl/wallet-balance';
import type { PnlComputeResponse, PnlMethod, PnlRangePreset } from '@/types/pnl';

export const maxDuration = 60;

const VALID_PRESETS: PnlRangePreset[] = ['1d', '7d', '30d', 'custom'];
const VALID_METHODS: PnlMethod[] = ['gmgn', 'balance_delta'];

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const body = (await req.json()) as {
    walletAddress?: string;
    fromMs?: number;
    toMs?: number;
    preset?: PnlRangePreset;
    method?: PnlMethod;
    includeBalance?: boolean;
  };

  const walletAddress = body.walletAddress?.trim();
  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }
  const fromMs = Number(body.fromMs);
  const toMs = Number(body.toMs);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    return NextResponse.json({ error: 'Plage de dates invalide' }, { status: 400 });
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
      return NextResponse.json(response);
    } catch (e) {
      console.error('[POST /api/pnl/compute] balance_delta', e);
      return NextResponse.json({ error: 'Échec du calcul PNL (delta de balance)' }, { status: 502 });
    }
  }

  const warnings: string[] = [];

  const [pnlSettled, balanceSettled] = await Promise.allSettled([
    computeWalletPnl(walletAddress, fromMs, toMs, preset),
    includeBalance ? fetchWalletBalance(walletAddress) : Promise.resolve(null),
  ]);

  if (pnlSettled.status === 'rejected') {
    console.error('[POST /api/pnl/compute] pnl', pnlSettled.reason);
    return NextResponse.json({ error: 'Échec du calcul PNL' }, { status: 502 });
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
  return NextResponse.json(response);
}
