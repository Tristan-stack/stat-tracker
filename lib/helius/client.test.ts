import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const FAKE_KEY = 'test-api-key-123';

describe('helius client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('HELIUS_API_KEY', FAKE_KEY);
    vi.stubEnv('HELIUS_MAX_RETRIES', '0');
    vi.stubEnv('HELIUS_RPS', '1000');
    vi.stubEnv('HELIUS_RETRY_BASE_MS', '1');
    vi.stubEnv('HELIUS_RATE_LIMIT_MIN_WAIT_MS', '1');
    vi.stubEnv('HELIUS_RATE_LIMIT_MAX_WAIT_MS', '2');
    vi.stubEnv('HELIUS_PARSE_BATCH_SIZE', '50');
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

  describe('getCreatedAssetsCount', () => {
    function mockDasPair(
      creatorResult: Record<string, unknown> | null,
      authorityResult: Record<string, unknown> | null,
      enhanced?: { mint?: unknown[]; create?: unknown[] }
    ): ReturnType<typeof vi.spyOn> {
      return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes('/addresses/') && urlStr.includes('/transactions')) {
          const type = new URL(urlStr).searchParams.get('type');
          const list =
            type === 'TOKEN_MINT'
              ? (enhanced?.mint ?? [])
              : type === 'CREATE'
                ? (enhanced?.create ?? [])
                : [];
          return new Response(JSON.stringify(list), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const body = JSON.parse((init?.body as string) ?? '{}') as {
          params?: Record<string, unknown>;
        };
        const isCreator = body.params && 'creatorAddress' in body.params;
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            result: isCreator ? (creatorResult ?? {}) : (authorityResult ?? {}),
          }),
          { status: 200 }
        );
      });
    }

    it('renvoie le total renvoyé par DAS searchAssets (creatorAddress)', async () => {
      const { getCreatedAssetsCount } = await import('./client');
      mockDasPair({ total: 17, items: [{ id: 'mint-1' }] }, { total: 0 });

      const count = await getCreatedAssetsCount('CreatorWallet');
      expect(count).toBe(17);
    });

    it('détecte via authorityAddress quand creatorAddress renvoie 0', async () => {
      // Cas typique : token créé via raw initializeMint, l'adresse est update
      // authority mais ne figure pas dans le tableau creators du metadata.
      const { getCreatedAssetsCount } = await import('./client');
      mockDasPair({ total: 0 }, { total: 3, items: [{ id: 'mint-x' }] });

      const count = await getCreatedAssetsCount('AuthorityWallet');
      expect(count).toBe(3);
    });

    it('retombe sur items.length quand total est absent', async () => {
      const { getCreatedAssetsCount } = await import('./client');
      mockDasPair({ items: [{ id: 'mint-1' }] }, {});

      const count = await getCreatedAssetsCount('CreatorWallet');
      expect(count).toBe(1);
    });

    it('renvoie 0 quand les deux queries sont vides', async () => {
      const { getCreatedAssetsCount } = await import('./client');
      mockDasPair({}, {});

      const count = await getCreatedAssetsCount('NoCreatorHere');
      expect(count).toBe(0);
    });

    it('renvoie le max des deux quand les deux matchent (anti-double-count)', async () => {
      const { getCreatedAssetsCount } = await import('./client');
      mockDasPair({ total: 5 }, { total: 5 });

      const count = await getCreatedAssetsCount('BothCreatorAndAuthority');
      expect(count).toBe(5);
    });

    it('envoie creatorAddress ET authorityAddress avec tokenType all', async () => {
      const { getCreatedAssetsCount } = await import('./client');
      const fetchSpy = mockDasPair({ total: 0 }, { total: 0 });

      await getCreatedAssetsCount('WalletXYZ');

      const allCalls = fetchSpy.mock.calls as Array<[unknown, RequestInit | undefined]>;
      const rpcCalls = allCalls.filter((call) => {
        const init = call[1];
        return typeof init?.body === 'string' && init.body.includes('searchAssets');
      });
      expect(rpcCalls).toHaveLength(2);
      const bodies = rpcCalls.map((call) =>
        JSON.parse(call[1]!.body as string)
      ) as Array<{ method: string; params: Record<string, unknown> }>;
      const params = bodies.map((b) => b.params);
      expect(params).toContainEqual({
        creatorAddress: 'WalletXYZ',
        tokenType: 'all',
        page: 1,
        limit: 1,
      });
      expect(params).toContainEqual({
        authorityAddress: 'WalletXYZ',
        tokenType: 'all',
        page: 1,
        limit: 1,
      });
    });

    it('détecte via TOKEN_MINT enrichi quand DAS renvoie 0', async () => {
      const { getCreatedAssetsCount } = await import('./client');
      mockDasPair({ total: 0 }, { total: 0 }, {
        mint: [
          {
            type: 'TOKEN_MINT',
            feePayer: 'PumpCreator',
            signature: 'mintSig1',
            timestamp: 1,
            source: 'PUMP_FUN',
            description: '',
            fee: 0,
            slot: 1,
            nativeTransfers: [],
            tokenTransfers: [],
            events: {},
          },
        ],
      });

      const count = await getCreatedAssetsCount('PumpCreator');
      expect(count).toBe(1);
    });

    it("renvoie 0 quand DAS et l'historique enrichi sont vides", async () => {
      const { getCreatedAssetsCount } = await import('./client');
      mockDasPair({ total: 0 }, { total: 0 });

      const count = await getCreatedAssetsCount('Wallet');
      expect(count).toBe(0);
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
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Rate limited', { status: 429 })
      );

      await expect(heliusRest('/v0/transactions', {})).rejects.toThrow('HTTP 429');
    });

    it('retries transient 502 and succeeds', async () => {
      vi.stubEnv('HELIUS_MAX_RETRIES', '1');
      const { heliusRest } = await import('./client');
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ type: 'SWAP', signature: 'ok' }]), { status: 200 }));

      const result = await heliusRest('/v0/transactions', { transactions: ['tx1'] });
      expect(Array.isArray(result)).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries network error and succeeds', async () => {
      vi.stubEnv('HELIUS_MAX_RETRIES', '1');
      const { heliusRest } = await import('./client');
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ type: 'SWAP', signature: 'ok' }]), { status: 200 }));

      const result = await heliusRest('/v0/transactions', { transactions: ['tx2'] });
      expect(Array.isArray(result)).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
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

    it('batches signatures using configured/default batch size', async () => {
      const { parseTransactions } = await import('./client');
      const sigs = Array.from({ length: 150 }, (_, i) => `sig${i}`);
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify([{ type: 'SWAP' }]), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ type: 'TRANSFER' }]), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ type: 'TRANSFER' }]), { status: 200 }));

      const result = await parseTransactions(sigs);
      expect(result).toHaveLength(3);
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      const firstBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(firstBody.transactions).toHaveLength(50);
      const secondBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
      expect(secondBody.transactions).toHaveLength(50);
      const thirdBody = JSON.parse(fetchSpy.mock.calls[2][1]?.body as string);
      expect(thirdBody.transactions).toHaveLength(50);
    });
  });
});
