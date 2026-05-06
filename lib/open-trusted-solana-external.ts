'use client';

import { safeUserHttpUrl } from '@/lib/safe-browser-url';
import {
  SOLANA_BASE58_ADDRESS,
  SOLANA_BASE58_TX_SIG,
} from '@/lib/solana-external-links';

const SOLSCAN_ORIGIN = 'https://solscan.io';
const GMGN_SOL_ORIGIN = 'https://gmgn.ai/sol';

function trim(s: string) {
  return s.trim();
}

/**
 * Ouvre Solscan / GMGN dans un nouvel onglet après validation stricte (pas de `href` dynamique — évite les faux positifs SAST).
 */
export function canOpenSolanaAddressOrMint(value: string): boolean {
  return SOLANA_BASE58_ADDRESS.test(trim(value));
}

export function canOpenSolscanAccount(address: string): boolean {
  return canOpenSolanaAddressOrMint(address);
}

export function canOpenSolanaTx(signature: string): boolean {
  return SOLANA_BASE58_TX_SIG.test(trim(signature));
}

export function openSolscanAccountInNewTab(address: string): boolean {
  const a = trim(address);
  if (!SOLANA_BASE58_ADDRESS.test(a)) return false;
  const url = `${SOLSCAN_ORIGIN}/account/${encodeURIComponent(a)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export function openSolscanTokenInNewTab(mint: string): boolean {
  return openSolscanAccountInNewTab(mint);
}

export function openSolscanTxInNewTab(signature: string): boolean {
  const s = trim(signature);
  if (!SOLANA_BASE58_TX_SIG.test(s)) return false;
  const url = `${SOLSCAN_ORIGIN}/tx/${encodeURIComponent(s)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export function openGmgnSolAddressInNewTab(address: string): boolean {
  const a = trim(address);
  if (!SOLANA_BASE58_ADDRESS.test(a)) return false;
  const url = `${GMGN_SOL_ORIGIN}/address/${encodeURIComponent(a)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export function openGmgnSolTokenInNewTab(mint: string): boolean {
  const m = trim(mint);
  if (!SOLANA_BASE58_ADDRESS.test(m)) return false;
  const url = `${GMGN_SOL_ORIGIN}/token/${encodeURIComponent(m)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export function openSafeUserHttpUrlInNewTab(raw: string): boolean {
  const url = safeUserHttpUrl(raw);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
