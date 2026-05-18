import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HeliusEnhancedTransaction, RawTransaction } from '@/lib/helius/client';
import type { TracerStrategy } from './tracers/types';

vi.mock('@/lib/helius/client', () => ({
  getEnhancedTransactionsByAddress: vi.fn(),
  getRawTransaction: vi.fn(),
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

vi.mock('@/lib/helius/exchange-addresses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/helius/exchange-addresses')>();
  return { ...actual };
});

import { getEnhancedTransactionsByAddress, getRawTransaction } from '@/lib/helius/client';
import { stepAddress } from './trace-engine';

const mockGetTxs = vi.mocked(getEnhancedTransactionsByAddress);
const mockGetRawTx = vi.mocked(getRawTransaction);

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

const LAMPORTS = 1_000_000_000;

function makeTx(
  from: string,
  to: string,
  solAmount: number,
  timestamp: number,
  signature?: string
): HeliusEnhancedTransaction {
  return {
    description: '',
    type: 'TRANSFER',
    source: 'SYSTEM_PROGRAM',
    fee: 5000,
    feePayer: from,
    signature: signature ?? `sig-${from}-${to}-${timestamp}`,
    slot: 1,
    timestamp,
    nativeTransfers: [{ fromUserAccount: from, toUserAccount: to, amount: solAmount * LAMPORTS }],
    tokenTransfers: [],
    events: {},
  };
}

function makeBareTx(
  feePayer: string,
  timestamp: number,
  signature: string,
  type = 'CREATE_ACCOUNT'
): HeliusEnhancedTransaction {
  return {
    description: '',
    type,
    source: 'SYSTEM_PROGRAM',
    fee: 5000,
    feePayer,
    signature,
    slot: 1,
    timestamp,
    nativeTransfers: [],
    tokenTransfers: [],
    events: {},
  };
}

function makeRawCreateAccount(
  source: string,
  newAccount: string,
  lamports: number
): RawTransaction {
  return {
    transaction: {
      message: {
        instructions: [
          {
            programId: SYSTEM_PROGRAM_ID,
            accounts: [],
            parsed: {
              type: 'createAccountWithSeed',
              info: { source, newAccount, lamports },
            },
          },
        ],
        accountKeys: [],
      },
      signatures: ['sig'],
    },
    meta: { err: null },
    blockTime: null,
    slot: 0,
  };
}

/**
 * Tx avec create+close éphémère : `funder` crée `ephemeral` avec `lamports` SOL,
 * puis ferme `ephemeral` vers `dest` dans la même tx.
 */
function makeRawCreateAndClose(
  funder: string,
  ephemeral: string,
  dest: string,
  lamports: number
): RawTransaction {
  return {
    transaction: {
      message: {
        instructions: [
          {
            programId: SYSTEM_PROGRAM_ID,
            accounts: [],
            parsed: {
              type: 'createAccountWithSeed',
              info: { source: funder, newAccount: ephemeral, lamports },
            },
          },
          {
            programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            accounts: [],
            parsed: {
              type: 'closeAccount',
              info: { account: ephemeral, destination: dest, owner: funder },
            },
          },
        ],
        accountKeys: [
          { pubkey: funder, signer: true, writable: true },
          { pubkey: ephemeral, signer: false, writable: true },
          { pubkey: dest, signer: false, writable: true },
        ],
      },
      signatures: ['sig'],
    },
    meta: { err: null, preBalances: [10_000_000_000, 0, 0] },
    blockTime: null,
    slot: 0,
  };
}

const passthroughTracer: TracerStrategy = {
  id: '7srsw',
  label: '7Srsw',
  resolveRealRecipient: vi.fn(async (apparent: string) => ({ recipient: apparent, deobfuscated: false })),
};

beforeEach(() => {
  vi.clearAllMocks();
  passthroughTracer.resolveRealRecipient = vi.fn(async (apparent: string) => ({
    recipient: apparent,
    deobfuscated: false,
  }));
});

describe('stepAddress', () => {
  it('renvoie auto avec un seul match dans la fenêtre', async () => {
    mockGetTxs.mockResolvedValueOnce([makeTx('A', 'B', 1.2, 1700000000)]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('auto');
    if (result.kind === 'auto') {
      expect(result.hop.to).toBe('B');
      expect(result.hop.solAmount).toBeCloseTo(1.2);
      expect(result.nextSinceTimestamp).toBe(1700000000);
    }
  });

  it('filtre les transferts hors fenêtre SOL', async () => {
    mockGetTxs.mockResolvedValueOnce([
      makeTx('A', 'B', 0.5, 1700000000),
      makeTx('A', 'C', 5, 1700000100),
    ]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('stop');
    if (result.kind === 'stop') expect(result.stoppedBy).toBe('no_match');
  });

  it('filtre les transferts antérieurs à sinceTimestamp', async () => {
    mockGetTxs.mockResolvedValueOnce([
      makeTx('A', 'B', 1.2, 1700000000), // avant
      makeTx('A', 'C', 1.3, 1700000500), // après
    ]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: 1700000200,
      depthReached: 1,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('auto');
    if (result.kind === 'auto') expect(result.hop.to).toBe('C');
  });

  it('prend toujours le transfert le plus récent vers la même destination', async () => {
    mockGetTxs.mockResolvedValueOnce([
      makeTx('A', 'B', 1.0, 1700000000, 'sig-old'),
      makeTx('A', 'B', 1.5, 1700000500, 'sig-mid'),
      makeTx('A', 'B', 1.1, 1700001000, 'sig-latest'),
    ]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('auto');
    if (result.kind === 'auto') {
      expect(result.hop.signature).toBe('sig-latest');
      expect(result.hop.timestamp).toBe(1700001000);
    }
  });

  it('pick latest across distinct destinations (cas split : 7Srsw + adresse normale)', async () => {
    // Simule le cas observé : la fenêtre contient 2 sorties vers des destinations
    // différentes. On doit prendre la plus récente, peu importe la destination.
    mockGetTxs.mockResolvedValueOnce([
      makeTx('A', 'Decoy', 1.4, 1700000500, 'sig-decoy-older'),
      makeTx('A', 'Normal', 1.2, 1700001000, 'sig-normal-latest'),
    ]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('auto');
    if (result.kind === 'auto') {
      expect(result.hop.to).toBe('Normal');
      expect(result.hop.signature).toBe('sig-normal-latest');
      expect(result.hop.timestamp).toBe(1700001000);
    }
  });

  it('stop circular quand le destinataire est déjà visité', async () => {
    mockGetTxs.mockResolvedValueOnce([makeTx('A', 'B', 1.2, 1700000000)]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A', 'B']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('stop');
    if (result.kind === 'stop') expect(result.stoppedBy).toBe('circular');
  });

  it('stop exchange quand le destinataire est un exchange connu', async () => {
    const binance = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
    mockGetTxs.mockResolvedValueOnce([makeTx('A', binance, 1.2, 1700000000)]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('stop');
    if (result.kind === 'stop') expect(result.stoppedBy).toBe('exchange');
  });

  it('stop noisy quand > 500 transferts sortants', async () => {
    const txs = Array.from({ length: 501 }, (_, i) =>
      makeTx('A', `Dest${i}`, 0.001, 1700000000 + i)
    );
    mockGetTxs.mockResolvedValueOnce(txs);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('stop');
    if (result.kind === 'stop') expect(result.stoppedBy).toBe('noisy');
  });

  it('stop depth quand la profondeur max est atteinte', async () => {
    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 5,
      maxDepth: 5,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('stop');
    if (result.kind === 'stop') expect(result.stoppedBy).toBe('depth');
    expect(mockGetTxs).not.toHaveBeenCalled();
  });

  it('applique la résolution du tracer même quand 1 seul match', async () => {
    const resolveMock = vi.fn(async (apparent: string) => ({
      recipient: apparent === 'Decoy' ? 'RealDest' : apparent,
      deobfuscated: apparent === 'Decoy',
    }));
    const tracer: TracerStrategy = { id: '7srsw', label: '7Srsw', resolveRealRecipient: resolveMock };

    mockGetTxs.mockResolvedValueOnce([makeTx('A', 'Decoy', 1.2, 1700000000)]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(resolveMock).toHaveBeenCalledWith('Decoy', expect.any(String));
    expect(result.kind).toBe('auto');
    if (result.kind === 'auto') {
      expect(result.hop.to).toBe('RealDest');
      expect(result.hop.apparentTo).toBe('Decoy');
      expect(result.hop.deobfuscated).toBe(true);
    }
  });

  it('ignore les self-transfers (from === to)', async () => {
    mockGetTxs.mockResolvedValueOnce([makeTx('A', 'A', 1.2, 1700000000)]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(result.kind).toBe('stop');
    if (result.kind === 'stop') expect(result.stoppedBy).toBe('no_match');
  });

  it('détecte un createAccountWithSeed via fallback raw-tx quand nativeTransfers est vide', async () => {
    // Cas réel CyEGLG8jur… : Helius ne reporte rien dans nativeTransfers
    // mais une CREATE ACCOUNT WITH SEED envoie 3.498807884 SOL.
    mockGetTxs.mockResolvedValueOnce([
      makeBareTx('A', 1700001000, 'sig-create'),
    ]);
    mockGetRawTx.mockResolvedValueOnce(
      makeRawCreateAccount('A', 'NEW', 3.498807884 * LAMPORTS)
    );

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 4 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(mockGetRawTx).toHaveBeenCalledWith('sig-create');
    expect(result.kind).toBe('auto');
    if (result.kind === 'auto') {
      expect(result.hop.to).toBe('NEW');
      expect(result.hop.solAmount).toBeCloseTo(3.498807884);
      expect(result.hop.signature).toBe('sig-create');
    }
  });

  it("détecte un close éphémère depuis le token account lui-même (feePayer ≠ currentAddress)", async () => {
    // Cas réel 9AkiQq…AbdtEA : on trace le token account éphémère, qui n'est PAS
    // le fee payer (le fee payer est le funder CyEGLG). Le fallback doit quand
    // même se déclencher et détecter la closeAccount sortante vers EtSY.
    mockGetTxs.mockResolvedValueOnce([
      makeBareTx('Funder', 1700002000, 'sig-create-close', 'UNKNOWN'),
    ]);
    mockGetRawTx.mockResolvedValueOnce(
      makeRawCreateAndClose('Funder', 'Ephemeral', 'FinalDest', 3.498807884 * LAMPORTS)
    );

    const result = await stepAddress({
      currentAddress: 'Ephemeral',
      visited: new Set(['Ephemeral']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 4 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(mockGetRawTx).toHaveBeenCalledWith('sig-create-close');
    expect(result.kind).toBe('auto');
    if (result.kind === 'auto') {
      expect(result.hop.to).toBe('FinalDest');
      expect(result.hop.solAmount).toBeCloseTo(3.498807884);
    }
  });

  it("saute le fallback raw-tx quand la tx est un inflow pur (nativeTransfer entrant uniquement)", async () => {
    // Cas typique : currentAddress reçoit du SOL depuis OTHER. nativeTransfers
    // contient un transfert OTHER → A, pas d'outflow depuis A. On ne fetch pas
    // la raw-tx (gain de perf).
    mockGetTxs.mockResolvedValueOnce([makeTx('OTHER', 'A', 1.2, 1700001000)]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 4 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(mockGetRawTx).not.toHaveBeenCalled();
    expect(result.kind).toBe('stop');
    if (result.kind === 'stop') expect(result.stoppedBy).toBe('no_match');
  });

  it('utilise nativeTransfers en priorité et ne fetch pas la raw-tx si une sortie native existe', async () => {
    mockGetTxs.mockResolvedValueOnce([makeTx('A', 'B', 1.5, 1700000000)]);

    const result = await stepAddress({
      currentAddress: 'A',
      visited: new Set(['A']),
      minLamports: 1 * LAMPORTS,
      maxLamports: 2 * LAMPORTS,
      tracer: passthroughTracer,
      sinceTimestamp: null,
      depthReached: 0,
      maxDepth: 10,
      tracerType: '7srsw',
    });

    expect(mockGetRawTx).not.toHaveBeenCalled();
    expect(result.kind).toBe('auto');
    if (result.kind === 'auto') expect(result.hop.to).toBe('B');
  });
});
