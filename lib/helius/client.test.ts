import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const FAKE_KEY = 'test-api-key-123';

describe('helius client', () => {
  beforeEach(() => {
    vi.stubEnv('HELIUS_API_KEY', FAKE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('heliusRpc', () => {
    it('sends a JSON-RPC request and returns the result', async () => {
      const { heliusRpc } = await import('./client');
      const mockResult = [{ signature: 'abc123', slot: 100, err: null, memo: null, blockTime: 1700000000 }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: mockResult }), { status: 200 })
      );

      const result = await heliusRpc('getSignaturesForAddress', ['SomeAddress', { limit: 10 }]);
      expect(result).toEqual(mockResult);
    });

    it('throws on RPC error response', async () => {
      const { heliusRpc } = await import('./client');
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid request' } }),
          { status: 200 }
        )
      );

      await expect(heliusRpc('badMethod', [])).rejects.toThrow('Invalid request');
    });

    it('throws on HTTP error', async () => {
      const { heliusRpc } = await import('./client');
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Unauthorized', { status: 401 })
      );

      await expect(heliusRpc('getSlot', [])).rejects.toThrow('HTTP 401');
    });
  });

  describe('heliusRest', () => {
    it('sends a POST request to the REST API', async () => {
      const { heliusRest } = await import('./client');
      const mockTxs = [{ type: 'SWAP', source: 'RAYDIUM', signature: 'tx1', timestamp: 1700000000 }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockTxs), { status: 200 })
      );

      const result = await heliusRest('/v0/transactions', { transactions: ['tx1'] });
      expect(result).toEqual(mockTxs);
    });

    it('throws on HTTP error', async () => {
      const { heliusRest } = await import('./client');
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('Rate limited', { status: 429 })
      );

      await expect(heliusRest('/v0/transactions', {})).rejects.toThrow('HTTP 429');
    });
  });

  describe('getSignaturesForAddress', () => {
    it('calls RPC with correct params', async () => {
      const { getSignaturesForAddress } = await import('./client');
      const mockSigs = [{ signature: 'sig1', slot: 1, err: null, memo: null, blockTime: 1700000000 }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: mockSigs }), { status: 200 })
      );

      const result = await getSignaturesForAddress('TokenMintAddr');
      expect(result).toEqual(mockSigs);
    });

    it('passes optional before param', async () => {
      const { getSignaturesForAddress } = await import('./client');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: [] }), { status: 200 })
      );

      await getSignaturesForAddress('TokenMintAddr', { limit: 50, before: 'prevSig' });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(body.params[1].limit).toBe(50);
      expect(body.params[1].before).toBe('prevSig');
    });
  });

  describe('parseTransactions', () => {
    it('returns empty array for empty input', async () => {
      const { parseTransactions } = await import('./client');
      const result = await parseTransactions([]);
      expect(result).toEqual([]);
    });

    it('batches signatures into groups of 100', async () => {
      const { parseTransactions } = await import('./client');
      const sigs = Array.from({ length: 150 }, (_, i) => `sig${i}`);
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify([{ type: 'SWAP' }]), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ type: 'TRANSFER' }]), { status: 200 }));

      const result = await parseTransactions(sigs);
      expect(result).toHaveLength(2);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const firstBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(firstBody.transactions).toHaveLength(100);
      const secondBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
      expect(secondBody.transactions).toHaveLength(50);
    });
  });
});
