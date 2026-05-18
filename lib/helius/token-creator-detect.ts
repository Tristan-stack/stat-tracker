import type { HeliusEnhancedTransaction } from '@/lib/helius/client';

/** Types Helius Enhanced Transactions associés à une création de token. */
const TOKEN_CREATION_TYPES = new Set([
  'TOKEN_MINT',
  'CREATE',
  'CREATE_MINT_METADATA',
  'CREATE_TOKEN_POOL',
]);

/**
 * Indique si `wallet` est le fee payer d'une tx Helius classée comme création de token.
 * Couvre TOKEN_MINT, CREATE (pump.fun / launchpads) et variantes *_MINT.
 */
export function isWalletTokenCreationTx(
  tx: HeliusEnhancedTransaction,
  wallet: string
): boolean {
  if (tx.feePayer !== wallet) return false;
  if (TOKEN_CREATION_TYPES.has(tx.type)) return true;
  if (tx.type.endsWith('_MINT') && !tx.type.includes('BURN')) return true;
  return false;
}

/** Compte les créations distinctes (dédupliquées par signature). */
export function countTokenCreationsFromEnhancedTxs(
  txs: HeliusEnhancedTransaction[],
  wallet: string
): number {
  const signatures = new Set<string>();
  for (const tx of txs) {
    if (!isWalletTokenCreationTx(tx, wallet)) continue;
    signatures.add(tx.signature);
  }
  return signatures.size;
}
