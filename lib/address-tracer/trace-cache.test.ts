import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AddressTraceHop } from '@/types/address-trace';

vi.mock('@/lib/db', () => ({
  query: vi.fn(),
}));

vi.mock('@/lib/helius/client', () => ({
  LAMPORTS_PER_SOL: 1_000_000_000,
}));

import { query } from '@/lib/db';
import {
  deleteCachedTrace,
  loadCachedTrace,
  solToLamports,
  storeCachedTrace,
} from './trace-cache';

const mockQuery = vi.mocked(query);

const USER_ID = 'user-1';

function makeHop(index: number, to: string): AddressTraceHop {
  return {
    index,
    from: `addr-${index - 1}`,
    to,
    apparentTo: to,
    solAmount: 1.5,
    signature: `sig-${index}`,
    timestamp: 1700000000 + index,
    deobfuscated: false,
    tracerType: '7srsw',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue([]);
});

describe('solToLamports', () => {
  it('convertit SOL en lamports entiers', () => {
    expect(solToLamports(1)).toBe(1_000_000_000);
    expect(solToLamports(1.5)).toBe(1_500_000_000);
    expect(solToLamports(0)).toBe(0);
  });

  it('arrondit les flottants imprécis', () => {
    expect(solToLamports(0.1 + 0.2)).toBe(300_000_000);
  });
});

describe('loadCachedTrace', () => {
  it('renvoie null si pas de ligne en base', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const result = await loadCachedTrace(USER_ID, '7srsw', 'StartA', 1_000_000_000, 2_000_000_000);
    expect(result).toBeNull();
  });

  it('reconstruit AddressTraceResult depuis la ligne', async () => {
    const hops = [makeHop(1, 'B'), makeHop(2, 'C')];
    mockQuery.mockResolvedValueOnce([
      {
        tracer_type: '7srsw',
        start_address: 'StartA',
        min_lamports: '1000000000',
        max_lamports: '2000000000',
        journal_json: JSON.stringify(hops),
        stopped_by: 'depth',
        resolved_at: new Date('2026-05-18T09:00:00Z'),
      },
    ]);

    const result = await loadCachedTrace(USER_ID, '7srsw', 'StartA', 1_000_000_000, 2_000_000_000);

    expect(result).not.toBeNull();
    expect(result!.startAddress).toBe('StartA');
    expect(result!.tracerType).toBe('7srsw');
    expect(result!.hops).toHaveLength(2);
    expect(result!.hops[0]!.to).toBe('B');
    expect(result!.stoppedBy).toBe('depth');
    expect(result!.minSol).toBeCloseTo(1);
    expect(result!.maxSol).toBeCloseTo(2);
  });

  it('renvoie null si le JSON est corrompu', async () => {
    mockQuery.mockResolvedValueOnce([
      {
        tracer_type: '7srsw',
        start_address: 'StartA',
        min_lamports: '1000000000',
        max_lamports: '2000000000',
        journal_json: '{not json',
        stopped_by: null,
        resolved_at: new Date(),
      },
    ]);

    const result = await loadCachedTrace(USER_ID, '7srsw', 'StartA', 1_000_000_000, 2_000_000_000);
    expect(result).toBeNull();
  });

  it('utilise les bons paramètres SQL', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await loadCachedTrace(USER_ID, '7srsw', 'StartA', 1_000_000_000, 2_000_000_000);

    const call = mockQuery.mock.calls[0]!;
    expect(call[1]).toEqual([USER_ID, '7srsw', 'StartA', 1_000_000_000, 2_000_000_000]);
    expect(call[0]).toMatch(/SELECT/);
    expect(call[0]).toMatch(/address_trace_cache/);
  });
});

describe('storeCachedTrace', () => {
  it('upsert avec la clé composite', async () => {
    const hops = [makeHop(1, 'B')];
    await storeCachedTrace(USER_ID, '7srsw', 'StartA', 1_000_000_000, 2_000_000_000, hops, 'no_match');

    const call = mockQuery.mock.calls[0]!;
    expect(call[0]).toMatch(/INSERT INTO address_trace_cache/);
    expect(call[0]).toMatch(/ON CONFLICT \(user_id, tracer_type, start_address, min_lamports, max_lamports\)/);
    expect(call[1]).toEqual([
      USER_ID,
      '7srsw',
      'StartA',
      1_000_000_000,
      2_000_000_000,
      JSON.stringify(hops),
      'no_match',
    ]);
  });
});

describe('deleteCachedTrace', () => {
  it('exécute un DELETE ciblé sur la clé composite et renvoie le nb de lignes supprimées', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'cache-row-1' }]);

    const deleted = await deleteCachedTrace(
      USER_ID,
      '7srsw',
      'StartA',
      1_000_000_000,
      2_000_000_000
    );

    expect(deleted).toBe(1);
    const call = mockQuery.mock.calls[0]!;
    expect(call[0]).toMatch(/DELETE FROM address_trace_cache/);
    expect(call[0]).toMatch(/user_id = \$1/);
    expect(call[0]).toMatch(/tracer_type = \$2/);
    expect(call[0]).toMatch(/start_address = \$3/);
    expect(call[0]).toMatch(/min_lamports = \$4/);
    expect(call[0]).toMatch(/max_lamports = \$5/);
    expect(call[0]).toMatch(/RETURNING id/);
    expect(call[1]).toEqual([USER_ID, '7srsw', 'StartA', 1_000_000_000, 2_000_000_000]);
  });

  it('renvoie 0 quand aucune ligne ne match', async () => {
    mockQuery.mockResolvedValueOnce([]);

    const deleted = await deleteCachedTrace(
      USER_ID,
      '7srsw',
      'NoSuchAddr',
      1_000_000_000,
      2_000_000_000
    );

    expect(deleted).toBe(0);
  });
});
