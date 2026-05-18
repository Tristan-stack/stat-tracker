import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RawTransaction, RawInstruction } from '@/lib/helius/client';

vi.mock('@/lib/helius/client', () => ({
  getRawTransaction: vi.fn(),
}));

import { getRawTransaction } from '@/lib/helius/client';
import { sevenSrswTracer, SEVEN_SRSW_DECOY } from './seven-srsw';
import { AddressTracerParseError } from './types';

const mockGetRaw = vi.mocked(getRawTransaction);

const SIGNER = '5Y5g8zPv2rf1V8gx6jhzTjCd9eCaPm4nCSb9W3NWa5U';
const REAL_RECIPIENT = 'G1Tk6C934Hm6hohqoBprJk67RqzR3xqH6M63aTQUeC4N';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

function makeTrapInstruction(): RawInstruction {
  return {
    programId: 'CustomUnknownProgramId',
    accounts: [SIGNER, REAL_RECIPIENT, SEVEN_SRSW_DECOY, SYSTEM_PROGRAM],
    data: 'deadbeef',
  };
}

function makeParsedSystemInstruction(): RawInstruction {
  return {
    programId: SYSTEM_PROGRAM,
    accounts: [SIGNER, REAL_RECIPIENT, SEVEN_SRSW_DECOY, SYSTEM_PROGRAM],
    parsed: { type: 'transfer', info: { source: SIGNER, destination: REAL_RECIPIENT, lamports: 1_000_000 } },
  };
}

function makeRawTx(opts: {
  top?: RawInstruction[];
  inner?: RawInstruction[];
}): RawTransaction {
  return {
    transaction: {
      message: {
        instructions: opts.top ?? [],
        accountKeys: [],
      },
      signatures: ['sig'],
    },
    meta: opts.inner
      ? { err: null, innerInstructions: [{ index: 0, instructions: opts.inner }] }
      : { err: null, innerInstructions: [] },
    blockTime: 1700000000,
    slot: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sevenSrswTracer.resolveRealRecipient', () => {
  it('pass-through quand le destinataire apparent n\'est pas 7Srsw', async () => {
    const result = await sevenSrswTracer.resolveRealRecipient(REAL_RECIPIENT, 'sigX');
    expect(result).toEqual({ recipient: REAL_RECIPIENT, deobfuscated: false });
    expect(mockGetRaw).not.toHaveBeenCalled();
  });

  it('détecte le leurre dans une instruction top-level et renvoie accounts[1]', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [makeTrapInstruction()] }));

    const result = await sevenSrswTracer.resolveRealRecipient(SEVEN_SRSW_DECOY, 'sigY');

    expect(result).toEqual({ recipient: REAL_RECIPIENT, deobfuscated: true });
    expect(mockGetRaw).toHaveBeenCalledWith('sigY');
  });

  it('détecte le leurre dans une inner instruction', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ inner: [makeTrapInstruction()] }));

    const result = await sevenSrswTracer.resolveRealRecipient(SEVEN_SRSW_DECOY, 'sigZ');

    expect(result.recipient).toBe(REAL_RECIPIENT);
    expect(result.deobfuscated).toBe(true);
  });

  it('ignore les instructions parsées même si accounts[2] matche', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [makeParsedSystemInstruction()] }));

    await expect(sevenSrswTracer.resolveRealRecipient(SEVEN_SRSW_DECOY, 'sigP')).rejects.toBeInstanceOf(
      AddressTracerParseError
    );
  });

  it('throw quand aucune instruction piège n\'est trouvée', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [] }));

    await expect(sevenSrswTracer.resolveRealRecipient(SEVEN_SRSW_DECOY, 'sigN')).rejects.toThrow(
      /Impossible de localiser l'instruction 7Srsw/
    );
  });

  it('throw quand accounts[1] est manquant', async () => {
    const truncated: RawInstruction = {
      programId: 'CustomUnknownProgramId',
      accounts: ['', SEVEN_SRSW_DECOY],
    };
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [truncated] }));

    await expect(sevenSrswTracer.resolveRealRecipient(SEVEN_SRSW_DECOY, 'sigK')).rejects.toBeInstanceOf(
      AddressTracerParseError
    );
  });
});
