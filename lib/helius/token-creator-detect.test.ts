import { describe, it, expect } from 'vitest';
import type { HeliusEnhancedTransaction } from '@/lib/helius/client';
import {
  countTokenCreationsFromEnhancedTxs,
  isWalletTokenCreationTx,
} from '@/lib/helius/token-creator-detect';

function makeTx(
  partial: Partial<HeliusEnhancedTransaction> & Pick<HeliusEnhancedTransaction, 'type' | 'feePayer'>
): HeliusEnhancedTransaction {
  return {
    description: '',
    source: '',
    fee: 0,
    signature: partial.signature ?? 'sig',
    slot: 1,
    timestamp: 1,
    nativeTransfers: [],
    tokenTransfers: [],
    events: {},
    ...partial,
  };
}

describe('token-creator-detect', () => {
  it('compte TOKEN_MINT où le wallet est fee payer', () => {
    const txs = [
      makeTx({ type: 'TOKEN_MINT', feePayer: 'Creator1', signature: 'a' }),
      makeTx({ type: 'SWAP', feePayer: 'Creator1', signature: 'b' }),
    ];
    expect(countTokenCreationsFromEnhancedTxs(txs, 'Creator1')).toBe(1);
  });

  it('compte CREATE (pump.fun) où le wallet est fee payer', () => {
    const txs = [makeTx({ type: 'CREATE', feePayer: 'PumpDev', source: 'PUMP_FUN', signature: 'c' })];
    expect(isWalletTokenCreationTx(txs[0]!, 'PumpDev')).toBe(true);
    expect(countTokenCreationsFromEnhancedTxs(txs, 'PumpDev')).toBe(1);
  });

  it('ignore les tx où le wallet n’est pas fee payer', () => {
    const txs = [makeTx({ type: 'TOKEN_MINT', feePayer: 'Other', signature: 'd' })];
    expect(countTokenCreationsFromEnhancedTxs(txs, 'Creator1')).toBe(0);
  });

  it('déduplique par signature', () => {
    const txs = [
      makeTx({ type: 'TOKEN_MINT', feePayer: 'Creator1', signature: 'same' }),
      makeTx({ type: 'CREATE', feePayer: 'Creator1', signature: 'same' }),
    ];
    expect(countTokenCreationsFromEnhancedTxs(txs, 'Creator1')).toBe(1);
  });
});
