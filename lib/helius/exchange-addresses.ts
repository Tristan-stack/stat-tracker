/**
 * Known exchange wallet addresses on Solana.
 *
 * Exchange hot wallets rotate frequently — this list is a best-effort baseline.
 * The funding chain tracer also uses a heuristic fallback: wallets with >500
 * incoming SOL transfers are flagged as exchange-like even if not in this set.
 *
 * Sources: Solscan labels, exchange audit disclosures, community reports.
 */

interface ExchangeEntry {
  address: string;
  label: string;
}

const KNOWN_EXCHANGES: ExchangeEntry[] = [
  // Binance
  { address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', label: 'Binance' },
  { address: '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', label: 'Binance' },
  { address: '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S', label: 'Binance' },
  { address: 'AC5RDfQFmDS1deWZos921JfqscXdByf4BKk5FGjVHdms', label: 'Binance' },

  // Coinbase
  { address: 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS', label: 'Coinbase' },
  { address: '2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm', label: 'Coinbase' },
  { address: 'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE', label: 'Coinbase' },

  // Kraken
  { address: 'FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiWB5k', label: 'Kraken' },
  { address: 'CiiDiPBhVfBPiETjq6FXnQpNkLCx2BHBohb1mudR2sQf', label: 'Kraken' },

  // OKX
  { address: '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD', label: 'OKX' },
  { address: 'ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ', label: 'OKX' },

  // Bybit
  { address: 'AC5RDfQFmDS1deWZos921JfqscXdByf4BKk5FGjVHdms', label: 'Bybit' },

  // KuCoin
  { address: 'BmFdpraQhkiDQE6SnfG5PVddMtR5fL7pc36Aah8BVj2B', label: 'KuCoin' },

  // Gate.io
  { address: 'u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w', label: 'Gate.io' },

  // CEX.IO
  { address: '2QwUbEACJ3ppwfyH19QCSVvNrRzfuK5mNVNDsDMsZKMh', label: 'CEX.IO' },
  { address: 'DUru5ZfCdCnjPFuY7NPniV3hhZqNJLgn2sBZJGaMc2Sj', label: 'CEX.IO' },
  { address: 'CGRNicgpirZd3unSzn1Y34k7w31rQftTbaJwEuQu31XP', label: 'CEX.IO' },
];

const exchangeSet = new Set(KNOWN_EXCHANGES.map((e) => e.address));
const exchangeMap = new Map(KNOWN_EXCHANGES.map((e) => [e.address, e.label]));

export function isKnownExchange(address: string): boolean {
  return exchangeSet.has(address);
}

export function getExchangeLabel(address: string): string | null {
  return exchangeMap.get(address) ?? null;
}

export const NOISY_WALLET_THRESHOLD = 500;

export function isNoisyWallet(incomingTransferCount: number): boolean {
  return incomingTransferCount > NOISY_WALLET_THRESHOLD;
}
