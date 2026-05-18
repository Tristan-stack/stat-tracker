import { describe, it, expect } from 'vitest';
import type { RawInstruction, RawTransaction } from '@/lib/helius/client';
import { extractSolOutflowsFromRaw } from './extract-sol-outflows';

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function makeRaw(opts: {
  instructions?: RawInstruction[];
  innerInstructions?: Array<{ index: number; instructions: RawInstruction[] }>;
  accountKeys?: string[];
  preBalances?: number[];
}): RawTransaction {
  return {
    transaction: {
      message: {
        instructions: opts.instructions ?? [],
        accountKeys: (opts.accountKeys ?? []).map((pubkey) => ({
          pubkey,
          signer: false,
          writable: true,
        })),
      },
      signatures: ['sig'],
    },
    meta: {
      err: null,
      innerInstructions: opts.innerInstructions,
      preBalances: opts.preBalances,
    },
    blockTime: null,
    slot: 0,
  };
}

describe('extractSolOutflowsFromRaw', () => {
  it('détecte un System Program transfer émis par address', () => {
    const raw = makeRaw({
      instructions: [
        {
          programId: SYSTEM_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'transfer',
            info: { source: 'A', destination: 'B', lamports: 1_500_000_000 },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'A');
    expect(out).toEqual([{ to: 'B', amountLamports: 1_500_000_000, kind: 'transfer' }]);
  });

  it("détecte un createAccount émis par address (newAccount = vraie destination)", () => {
    const raw = makeRaw({
      instructions: [
        {
          programId: SYSTEM_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'createAccount',
            info: { source: 'A', newAccount: 'NEW', lamports: 2_000_000_000 },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'A');
    expect(out).toEqual([{ to: 'NEW', amountLamports: 2_000_000_000, kind: 'createAccount' }]);
  });

  it('détecte un createAccountWithSeed émis par address (cas réel CyEGLG8j…)', () => {
    const raw = makeRaw({
      instructions: [
        {
          programId: SYSTEM_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'createAccountWithSeed',
            info: {
              source: 'CyEGLG8jurZpGi9R54c9b1Nf37rTE5SK4zrFAGUinZvZ',
              newAccount: '9AkiQq7rwiMjc3kmjWj8fK7XLbkv8mzYufCmSfAbdtEA',
              lamports: 3_498_807_884,
            },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'CyEGLG8jurZpGi9R54c9b1Nf37rTE5SK4zrFAGUinZvZ');
    expect(out).toEqual([
      {
        to: '9AkiQq7rwiMjc3kmjWj8fK7XLbkv8mzYufCmSfAbdtEA',
        amountLamports: 3_498_807_884,
        kind: 'createAccount',
      },
    ]);
  });

  it('détecte un closeAccount où address EST le compte fermé (montant = preBalance)', () => {
    // address = 'closedTokenAcc' : on trace le token account éphémère lui-même.
    const raw = makeRaw({
      accountKeys: ['feePayer', 'closedTokenAcc', 'destWallet'],
      preBalances: [10_000_000_000, 2_039_280, 1_000_000_000],
      instructions: [
        {
          programId: SPL_TOKEN_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'closeAccount',
            info: { account: 'closedTokenAcc', destination: 'destWallet', owner: 'feePayer' },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'closedTokenAcc');
    expect(out).toEqual([
      { to: 'destWallet', amountLamports: 2_039_280, kind: 'closeAccount' },
    ]);
  });

  it("détecte un create+close éphémère : montant repris du createAccount quand preBalance = 0", () => {
    // Cas réel 9AkiQq…AbdtEA : créé par createAccountWithSeed avec 3.498807884 SOL,
    // puis fermé immédiatement vers EtSY…. preBalance du nouveau compte = 0
    // (il n'existait pas avant la tx).
    const raw = makeRaw({
      accountKeys: ['CyEGLG…funder', '9AkiQq…ephemeral', 'EtSY…dest'],
      preBalances: [10_000_000_000, 0, 0],
      instructions: [
        {
          programId: SYSTEM_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'createAccountWithSeed',
            info: {
              source: 'CyEGLG…funder',
              newAccount: '9AkiQq…ephemeral',
              lamports: 3_498_807_884,
            },
          },
        },
        {
          programId: SPL_TOKEN_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'closeAccount',
            info: {
              account: '9AkiQq…ephemeral',
              destination: 'EtSY…dest',
              owner: 'CyEGLG…funder',
            },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, '9AkiQq…ephemeral');
    expect(out).toEqual([
      { to: 'EtSY…dest', amountLamports: 3_498_807_884, kind: 'closeAccount' },
    ]);
  });

  it("ne matche PAS closeAccount quand address est seulement l'owner (pas le compte fermé)", () => {
    // L'authority (owner) signe la fermeture mais la SOL part de `account`, pas
    // de `owner`. On évite d'attribuer cet outflow à l'owner pour ne pas
    // doubler-compter (le createAccount précédent avait déjà tracé owner→account).
    const raw = makeRaw({
      accountKeys: ['ownerWallet', 'closedTokenAcc', 'destWallet'],
      preBalances: [10_000_000_000, 2_039_280, 1_000_000_000],
      instructions: [
        {
          programId: SPL_TOKEN_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'closeAccount',
            info: { account: 'closedTokenAcc', destination: 'destWallet', owner: 'ownerWallet' },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'ownerWallet');
    expect(out).toEqual([]);
  });

  it('parcourt aussi les inner instructions (CPI)', () => {
    const raw = makeRaw({
      instructions: [],
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programId: SYSTEM_PROGRAM_ID,
              accounts: [],
              parsed: {
                type: 'createAccount',
                info: { source: 'A', newAccount: 'NEW', lamports: 500_000_000 },
              },
            },
          ],
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'A');
    expect(out).toEqual([{ to: 'NEW', amountLamports: 500_000_000, kind: 'createAccount' }]);
  });

  it('ignore les instructions dont source/owner ≠ address', () => {
    const raw = makeRaw({
      instructions: [
        {
          programId: SYSTEM_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'transfer',
            info: { source: 'X', destination: 'A', lamports: 1_000_000_000 },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'A');
    expect(out).toEqual([]);
  });

  it('ignore les instructions non parsées (programmes custom)', () => {
    const raw = makeRaw({
      instructions: [
        {
          programId: 'CustomProgram111111111111111111111111111111',
          accounts: ['A', 'B'],
          data: 'some_base58_data',
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'A');
    expect(out).toEqual([]);
  });

  it('ignore les self-transfers (destination === address)', () => {
    const raw = makeRaw({
      instructions: [
        {
          programId: SYSTEM_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'transfer',
            info: { source: 'A', destination: 'A', lamports: 1_000_000_000 },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'A');
    expect(out).toEqual([]);
  });

  it("ignore closeAccount si le compte fermé n'est pas dans accountKeys/preBalances et aucun createAccount associé", () => {
    const raw = makeRaw({
      accountKeys: ['feePayer', 'destWallet'],
      preBalances: [10_000_000_000, 1_000_000_000],
      instructions: [
        {
          programId: SPL_TOKEN_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'closeAccount',
            info: { account: 'unknownAcc', destination: 'destWallet', owner: 'feePayer' },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'unknownAcc');
    expect(out).toEqual([]);
  });

  it('accepte lamports passé en string (sérialisations RPC parfois numériques)', () => {
    const raw = makeRaw({
      instructions: [
        {
          programId: SYSTEM_PROGRAM_ID,
          accounts: [],
          parsed: {
            type: 'transfer',
            info: { source: 'A', destination: 'B', lamports: '750000000' },
          },
        },
      ],
    });

    const out = extractSolOutflowsFromRaw(raw, 'A');
    expect(out).toEqual([{ to: 'B', amountLamports: 750_000_000, kind: 'transfer' }]);
  });
});
