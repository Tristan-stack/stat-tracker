import { describe, it, expect } from 'vitest';
import { isKnownExchange, getExchangeLabel, isNoisyWallet, NOISY_WALLET_THRESHOLD } from './exchange-addresses';

describe('exchange-addresses', () => {
  describe('isKnownExchange', () => {
    it('returns true for a known Binance address', () => {
      expect(isKnownExchange('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')).toBe(true);
    });

    it('returns true for a known Coinbase address', () => {
      expect(isKnownExchange('H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS')).toBe(true);
    });

    it('returns false for a random address', () => {
      expect(isKnownExchange('So11111111111111111111111111111111111111112')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isKnownExchange('')).toBe(false);
    });
  });

  describe('getExchangeLabel', () => {
    it('returns the exchange name for a known address', () => {
      expect(getExchangeLabel('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')).toBe('Binance');
    });

    it('returns null for an unknown address', () => {
      expect(getExchangeLabel('unknownAddress123')).toBeNull();
    });
  });

  describe('isNoisyWallet', () => {
    it('returns true for counts above threshold', () => {
      expect(isNoisyWallet(NOISY_WALLET_THRESHOLD + 1)).toBe(true);
      expect(isNoisyWallet(1000)).toBe(true);
    });

    it('returns false for counts at or below threshold', () => {
      expect(isNoisyWallet(NOISY_WALLET_THRESHOLD)).toBe(false);
      expect(isNoisyWallet(100)).toBe(false);
      expect(isNoisyWallet(0)).toBe(false);
    });
  });
});
