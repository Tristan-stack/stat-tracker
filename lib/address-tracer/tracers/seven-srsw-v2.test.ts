import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RawTransaction, RawInstruction } from '@/lib/helius/client';

vi.mock('@/lib/helius/client', () => ({
  getRawTransaction: vi.fn(),
}));

import { getRawTransaction } from '@/lib/helius/client';
import { sevenSrswV2Tracer, SEVEN_SRSW_V2_DECOY_PROGRAMS } from './seven-srsw-v2';
import { SEVEN_SRSW_DECOY } from './seven-srsw';
import { AddressTracerParseError } from './types';

const mockGetRaw = vi.mocked(getRawTransaction);

const DECOY_PROGRAM = SEVEN_SRSW_V2_DECOY_PROGRAMS[0]!;
const FEE_PAYER = '9Y7xVEuZu9UHQzu91KtRjS29fZF6PvjZYeQ2s8RBkfot';
const SIGNER = 'Eee72gaq813tU9Mw4VNkpY9j7excqSvwdgEU93KpMCbL';
const REAL_RECIPIENT = 'BUD1P86xxZ9zDqumbotVpVhupbNL2NGPLiFPXonFMHX1';
const APPARENT_RECIPIENT = 'EphemeralCreatedAccount1111111111111111111';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

function makeTrapInstruction(): RawInstruction {
  return {
    programId: DECOY_PROGRAM,
    accounts: [FEE_PAYER, SIGNER, REAL_RECIPIENT, SYSTEM_PROGRAM],
    data: 'deadbeef',
  };
}

// Piège V1 : leurre = adresse fixe en accounts[2], vrai destinataire en accounts[1].
const V1_REAL_RECIPIENT = 'G1Tk6C934Hm6hohqoBprJk67RqzR3xqH6M63aTQUeC4N';

function makeV1TrapInstruction(): RawInstruction {
  return {
    programId: 'CustomUnknownProgramId',
    accounts: [FEE_PAYER, V1_REAL_RECIPIENT, SEVEN_SRSW_DECOY, SYSTEM_PROGRAM],
    data: 'deadbeef',
  };
}

function makeParsedDecoyInstruction(): RawInstruction {
  // Même programId leurre mais instruction parsée → doit être ignorée.
  return {
    programId: DECOY_PROGRAM,
    accounts: [FEE_PAYER, SIGNER, REAL_RECIPIENT, SYSTEM_PROGRAM],
    parsed: { type: 'transfer', info: { source: FEE_PAYER, destination: REAL_RECIPIENT, lamports: 1_000_000 } },
  };
}

function makeUnrelatedUnknownInstruction(): RawInstruction {
  return {
    programId: 'SomeOtherCustomProgramId1111111111111111111',
    accounts: [FEE_PAYER, SIGNER, REAL_RECIPIENT, SYSTEM_PROGRAM],
    data: 'cafe',
  };
}

function makeRawTx(opts: { top?: RawInstruction[]; inner?: RawInstruction[] }): RawTransaction {
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

describe('sevenSrswV2Tracer.resolveRealRecipient', () => {
  it('sur-ensemble V1 : délègue au leurre fixe 7Srsw et renvoie accounts[1]', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [makeV1TrapInstruction()] }));

    const result = await sevenSrswV2Tracer.resolveRealRecipient(SEVEN_SRSW_DECOY, 'sigV1');

    expect(result).toEqual({ recipient: V1_REAL_RECIPIENT, deobfuscated: true });
    expect(mockGetRaw).toHaveBeenCalledWith('sigV1');
  });

  it('sur-ensemble V1 : throw quand le destinataire apparent est le leurre 7Srsw sans piège V1', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [] }));

    await expect(
      sevenSrswV2Tracer.resolveRealRecipient(SEVEN_SRSW_DECOY, 'sigV1none')
    ).rejects.toBeInstanceOf(AddressTracerParseError);
  });

  it('détecte le piège dans une instruction top-level et renvoie accounts[2]', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [makeTrapInstruction()] }));

    const result = await sevenSrswV2Tracer.resolveRealRecipient(APPARENT_RECIPIENT, 'sigA');

    expect(result).toEqual({ recipient: REAL_RECIPIENT, deobfuscated: true });
    expect(mockGetRaw).toHaveBeenCalledWith('sigA');
  });

  it('détecte le piège dans une inner instruction', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ inner: [makeTrapInstruction()] }));

    const result = await sevenSrswV2Tracer.resolveRealRecipient(APPARENT_RECIPIENT, 'sigB');

    expect(result.recipient).toBe(REAL_RECIPIENT);
    expect(result.deobfuscated).toBe(true);
  });

  it('pass-through (pas de throw) quand aucune instruction au programme leurre', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [makeUnrelatedUnknownInstruction()] }));

    const result = await sevenSrswV2Tracer.resolveRealRecipient(APPARENT_RECIPIENT, 'sigC');

    expect(result).toEqual({ recipient: APPARENT_RECIPIENT, deobfuscated: false });
  });

  it('pass-through quand la transaction ne contient aucune instruction', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [] }));

    const result = await sevenSrswV2Tracer.resolveRealRecipient(APPARENT_RECIPIENT, 'sigD');

    expect(result).toEqual({ recipient: APPARENT_RECIPIENT, deobfuscated: false });
  });

  it('ignore les instructions parsées même si le programId leurre matche', async () => {
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [makeParsedDecoyInstruction()] }));

    const result = await sevenSrswV2Tracer.resolveRealRecipient(APPARENT_RECIPIENT, 'sigE');

    expect(result).toEqual({ recipient: APPARENT_RECIPIENT, deobfuscated: false });
  });

  it('throw quand le piège existe mais accounts[2] est manquant', async () => {
    const truncated: RawInstruction = {
      programId: DECOY_PROGRAM,
      accounts: [FEE_PAYER, SIGNER, ''],
      data: 'deadbeef',
    };
    mockGetRaw.mockResolvedValueOnce(makeRawTx({ top: [truncated] }));

    await expect(
      sevenSrswV2Tracer.resolveRealRecipient(APPARENT_RECIPIENT, 'sigF')
    ).rejects.toBeInstanceOf(AddressTracerParseError);
  });
});
