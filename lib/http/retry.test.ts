import { describe, it, expect } from 'vitest';
import { parseRetryAfterHeader, isRetryableFailure } from './retry';

describe('parseRetryAfterHeader', () => {
  it('null/empty → null', () => {
    expect(parseRetryAfterHeader(null)).toBeNull();
    expect(parseRetryAfterHeader('')).toBeNull();
  });
  it('secondes → ms', () => {
    expect(parseRetryAfterHeader('2')).toBe(2000);
    expect(parseRetryAfterHeader('0')).toBe(0);
  });
  it('date HTTP future → ms positifs', () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfterHeader(future);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(0);
  });
  it('valeur invalide → null', () => {
    expect(parseRetryAfterHeader('not-a-date')).toBeNull();
  });
});

describe('isRetryableFailure', () => {
  it('429 et 5xx sont retryables', () => {
    expect(isRetryableFailure(429, '')).toBe(true);
    expect(isRetryableFailure(502, '')).toBe(true);
    expect(isRetryableFailure(503, '')).toBe(true);
  });
  it('4xx (hors 429) non retryable', () => {
    expect(isRetryableFailure(401, '')).toBe(false);
    expect(isRetryableFailure(404, '')).toBe(false);
  });
  it('erreurs réseau retryables via message', () => {
    expect(isRetryableFailure(0, 'ECONNRESET')).toBe(true);
    expect(isRetryableFailure(0, 'fetch failed')).toBe(true);
    expect(isRetryableFailure(0, 'request timeout')).toBe(true);
    expect(isRetryableFailure(0, 'totally fine')).toBe(false);
  });
});
