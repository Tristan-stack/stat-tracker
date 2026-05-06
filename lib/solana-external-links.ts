/** Base58 Solana pubkey / mint (alphabet sans 0, O, I, l). */
export const SOLANA_BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Signature de transaction Solana (base58, longueur courante ~87–88). */
export const SOLANA_BASE58_TX_SIG = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/;

function trim(s: string) {
  return s.trim();
}

export function solscanAccountHref(address: string): string | undefined {
  const a = trim(address);
  if (!SOLANA_BASE58_ADDRESS.test(a)) return undefined;
  return `https://solscan.io/account/${encodeURIComponent(a)}`;
}

export function solscanTokenHref(mint: string): string | undefined {
  return solscanAccountHref(mint);
}

export function solscanTxHref(signature: string): string | undefined {
  const s = trim(signature);
  if (!SOLANA_BASE58_TX_SIG.test(s)) return undefined;
  return `https://solscan.io/tx/${encodeURIComponent(s)}`;
}

export function gmgnSolAddressHref(address: string): string | undefined {
  const a = trim(address);
  if (!SOLANA_BASE58_ADDRESS.test(a)) return undefined;
  return `https://gmgn.ai/sol/address/${encodeURIComponent(a)}`;
}

export function gmgnSolTokenHref(mint: string): string | undefined {
  const m = trim(mint);
  if (!SOLANA_BASE58_ADDRESS.test(m)) return undefined;
  return `https://gmgn.ai/sol/token/${encodeURIComponent(m)}`;
}
