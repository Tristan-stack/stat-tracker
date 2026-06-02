import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  HeliusEnhancedTransaction,
  RawTransaction,
  SignatureInfo,
} from '@/lib/helius/client';
import type { PnlBalance } from '@/types/pnl';

vi.mock('@/lib/helius/client', () => ({
  getSignaturesForAddress: vi.fn(),
  getRawTransaction: vi.fn(),
  getEnhancedTransactionsByAddress: vi.fn(),
  LAMPORTS_PER_SOL: 1_000_000_000,
}));
vi.mock('@/lib/pnl/wallet-balance', () => ({
  fetchWalletBalance: vi.fn(),
}));
vi.mock('@/lib/helius/sol-spot', () => ({
  fetchSolUsdFromHeliusDas: vi.fn(),
}));

import {
  getSignaturesForAddress,
  getRawTransaction,
  getEnhancedTransactionsByAddress,
} from '@/lib/helius/client';
import { fetchWalletBalance } from '@/lib/pnl/wallet-balance';
import { fetchSolUsdFromHeliusDas } from '@/lib/helius/sol-spot';
import { computeBalanceDeltaPnl } from './compute-balance-delta-pnl';

const mockSigs = vi.mocked(getSignaturesForAddress);
const mockRaw = vi.mocked(getRawTransaction);
const mockTransfers = vi.mocked(getEnhancedTransactionsByAddress);
const mockBalance = vi.mocked(fetchWalletBalance);
const mockSolUsd = vi.mocked(fetchSolUsdFromHeliusDas);

const WALLET = 'Wa11etTradingAddrXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const EXT = 'ExternalCounterpartyXXXXXXXXXXXXXXXXXXXXXXXXX';
const DAY = 86_400;

function sig(signature: string, blockTime: number): SignatureInfo {
  return { signature, slot: 1, err: null, memo: null, blockTime };
}

/** Tx brute avec le wallet à l'index 1 (vérifie le lookup par indexOf, pas seulement index 0). */
function rawWithBalance(preLamports: number, postLamports: number): RawTransaction {
  return {
    transaction: {
      message: {
        instructions: [],
        accountKeys: ['FeePayerXXXX', WALLET, '11111111111111111111111111111111'],
      },
      signatures: ['x'],
    },
    meta: {
      err: null,
      preBalances: [1_000_000_000, preLamports, 0],
      postBalances: [1_000_000_000, postLamports, 0],
    },
    blockTime: 0,
    slot: 1,
  };
}

function transferTx(
  signature: string,
  ts: number,
  opts: { in?: number; out?: number }
): HeliusEnhancedTransaction {
  const nativeTransfers = [];
  if (opts.in) nativeTransfers.push({ fromUserAccount: EXT, toUserAccount: WALLET, amount: opts.in });
  if (opts.out) nativeTransfers.push({ fromUserAccount: WALLET, toUserAccount: EXT, amount: opts.out });
  return {
    description: '',
    type: 'TRANSFER',
    source: 'SYSTEM_PROGRAM',
    fee: 5000,
    feePayer: WALLET,
    signature,
    slot: 1,
    timestamp: ts,
    nativeTransfers,
    tokenTransfers: [],
    events: {},
  };
}

function balanceFixture(over: Partial<PnlBalance> = {}): PnlBalance {
  return { sol: 4, lamports: 4_000_000_000, solUsd: 100, valueUsd: 400, ...over };
}

beforeEach(() => {
  // resetAllMocks vide aussi les files `...Once` et implémentations (isolation stricte).
  vi.resetAllMocks();
  mockSolUsd.mockResolvedValue(120);
  mockSigs.mockResolvedValue([]); // page suivante vide → fin de pagination
  mockTransfers.mockResolvedValue([]); // aucun transfert externe par défaut
  mockRaw.mockResolvedValue(rawWithBalance(0, 0));
});

describe('computeBalanceDeltaPnl', () => {
  it('preset (toMs≈now) : delta = solde courant − postBalance de la tx avant la fenêtre', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromMs = (nowSec - 7 * DAY) * 1000;
    const toMs = Date.now();

    mockBalance.mockResolvedValueOnce(balanceFixture()); // solde courant = 4 SOL
    mockSigs.mockResolvedValueOnce([
      sig('in1', nowSec - 1 * DAY),
      sig('in2', nowSec - 3 * DAY),
      sig('before', nowSec - 8 * DAY), // avant la fenêtre → borne start
    ]);
    mockRaw.mockResolvedValueOnce(rawWithBalance(0, 2_500_000_000)); // solde avant fenêtre = 2.5 SOL

    const { result, startBalanceSol, endBalanceSol, solUsd } = await computeBalanceDeltaPnl(
      WALLET,
      fromMs,
      toMs
    );

    expect(result.realizedSol).toBeCloseTo(1.5, 9); // 4 − 2.5, aucun transfert
    expect(result.realizedUsd).toBeCloseTo(150, 6);
    expect(result.tradeCount).toBe(2);
    expect(result.truncated).toBe(false);
    expect(startBalanceSol).toBeCloseTo(2.5, 9);
    expect(endBalanceSol).toBeCloseTo(4, 9);
    expect(solUsd).toBe(100);
  });

  it('exclut le financement initial d’un wallet récent (dépôt dans la fenêtre)', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromMs = (nowSec - 7 * DAY) * 1000;
    const toMs = Date.now();

    mockBalance.mockResolvedValueOnce(balanceFixture()); // solde courant = 4 SOL
    // Aucune tx avant la fenêtre : la 1ère tx du wallet (son financement) est in-window.
    mockSigs.mockResolvedValueOnce([
      sig('in1', nowSec - 1 * DAY),
      sig('funding', nowSec - 5 * DAY), // plus ancienne in-window
    ]);
    // preBalance du wallet avant son tout 1er tx = 0 → solde de début brut = 0.
    mockRaw.mockResolvedValueOnce(rawWithBalance(0, 3_500_000_000));
    // Le financement : dépôt de 3.5 SOL vers le wallet.
    mockTransfers.mockResolvedValueOnce([transferTx('funding', nowSec - 5 * DAY, { in: 3_500_000_000 })]);

    const { result, startBalanceSol } = await computeBalanceDeltaPnl(WALLET, fromMs, toMs);

    // Brut = 4 − 0 = 4 ; net transferts = +3.5 ; trading = 0.5 SOL.
    expect(startBalanceSol).toBeCloseTo(0, 9);
    expect(result.realizedSol).toBeCloseTo(0.5, 9);
    expect(result.realizedUsd).toBeCloseTo(50, 6);
  });

  it('ré-ajoute les retraits SOL (sortie) au PNL de trading', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromMs = (nowSec - 7 * DAY) * 1000;
    const toMs = Date.now();

    mockBalance.mockResolvedValueOnce(balanceFixture()); // solde courant = 4 SOL
    mockSigs.mockResolvedValueOnce([sig('in1', nowSec - 1 * DAY), sig('before', nowSec - 8 * DAY)]);
    mockRaw.mockResolvedValueOnce(rawWithBalance(0, 3_000_000_000)); // début = 3 SOL
    // Retrait de 2 SOL pendant la fenêtre.
    mockTransfers.mockResolvedValueOnce([transferTx('w', nowSec - 2 * DAY, { out: 2_000_000_000 })]);

    const { result } = await computeBalanceDeltaPnl(WALLET, fromMs, toMs);

    // Brut = 4 − 3 = 1 ; net transferts = −2 ; trading = 1 − (−2) = 3 SOL.
    expect(result.realizedSol).toBeCloseTo(3, 9);
  });

  it('période passée (toMs ancien) : solde de fin = postBalance de la dernière tx ≤ toMs', async () => {
    const base = 1_700_000_000; // bien dans le passé → toIsNow = false
    const fromMs = (base - 7 * DAY) * 1000;
    const toMs = base * 1000;

    mockBalance.mockResolvedValueOnce(balanceFixture());
    mockSigs.mockResolvedValueOnce([
      sig('after', base + 2 * DAY),
      sig('endIn', base - 1 * DAY),
      sig('before', base - 9 * DAY),
    ]);
    mockRaw.mockImplementation(async (s: string) => {
      if (s === 'endIn') return rawWithBalance(0, 5_000_000_000);
      if (s === 'before') return rawWithBalance(0, 3_000_000_000);
      throw new Error(`unexpected ${s}`);
    });

    const { result, startBalanceSol, endBalanceSol } = await computeBalanceDeltaPnl(
      WALLET,
      fromMs,
      toMs
    );

    expect(startBalanceSol).toBeCloseTo(3, 9);
    expect(endBalanceSol).toBeCloseTo(5, 9);
    expect(result.realizedSol).toBeCloseTo(2, 9);
    expect(result.tradeCount).toBe(1);
  });

  it('marque truncated quand la pagination plafonne sans atteindre le début', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromMs = (nowSec - 7 * DAY) * 1000;
    const toMs = Date.now();

    mockBalance.mockResolvedValueOnce(balanceFixture());
    let n = 0;
    mockSigs.mockImplementation(async () => {
      n += 1;
      return [sig(`loop${n}`, nowSec - 1 * DAY)];
    });
    mockRaw.mockResolvedValue(rawWithBalance(3_000_000_000, 3_000_000_000));

    const { result, warnings } = await computeBalanceDeltaPnl(WALLET, fromMs, toMs);

    expect(result.truncated).toBe(true);
    expect(warnings.some((w) => /tronqué/i.test(w))).toBe(true);
  });

  it('utilise le prix de secours Helius DAS quand le solde n’a pas de prix', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const fromMs = (nowSec - 7 * DAY) * 1000;
    const toMs = Date.now();

    mockBalance.mockResolvedValueOnce(balanceFixture({ solUsd: null, valueUsd: null }));
    mockSigs.mockResolvedValueOnce([sig('in1', nowSec - 1 * DAY), sig('before', nowSec - 8 * DAY)]);
    mockRaw.mockResolvedValueOnce(rawWithBalance(0, 3_000_000_000)); // début 3 SOL, fin 4 SOL

    const { result, solUsd } = await computeBalanceDeltaPnl(WALLET, fromMs, toMs);

    expect(mockSolUsd).toHaveBeenCalled();
    expect(solUsd).toBe(120);
    expect(result.realizedSol).toBeCloseTo(1, 9);
    expect(result.realizedUsd).toBeCloseTo(120, 6);
  });
});
