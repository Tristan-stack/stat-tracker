import { query } from '@/lib/db';
import { LAMPORTS_PER_SOL } from '@/lib/helius/client';
import type {
  AddressTraceHop,
  AddressTraceResult,
  AddressTraceStoppedBy,
  TracerType,
} from '@/types/address-trace';

interface CachedRow {
  tracer_type: string;
  start_address: string;
  min_lamports: string | number | bigint;
  max_lamports: string | number | bigint;
  journal_json: string;
  stopped_by: string | null;
  resolved_at: Date | string;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

function toNumberLamports(value: string | number | bigint): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return Number.parseInt(value, 10);
}

export async function loadCachedTrace(
  userId: string,
  tracerType: TracerType,
  startAddress: string,
  minLamports: number,
  maxLamports: number
): Promise<AddressTraceResult | null> {
  const rows = await query<CachedRow>(
    `SELECT tracer_type, start_address, min_lamports, max_lamports, journal_json, stopped_by, resolved_at
     FROM address_trace_cache
     WHERE user_id = $1
       AND tracer_type = $2
       AND start_address = $3
       AND min_lamports = $4
       AND max_lamports = $5
     LIMIT 1`,
    [userId, tracerType, startAddress, minLamports, maxLamports]
  );

  const row = rows[0];
  if (!row) return null;

  let hops: AddressTraceHop[] = [];
  try {
    hops = JSON.parse(row.journal_json) as AddressTraceHop[];
  } catch {
    return null;
  }

  const stoppedBy = (row.stopped_by ?? 'completed') as AddressTraceStoppedBy;
  const resolvedAt =
    row.resolved_at instanceof Date ? row.resolved_at.toISOString() : new Date(row.resolved_at).toISOString();

  return {
    startAddress: row.start_address,
    tracerType: row.tracer_type as TracerType,
    minSol: toNumberLamports(row.min_lamports) / LAMPORTS_PER_SOL,
    maxSol: toNumberLamports(row.max_lamports) / LAMPORTS_PER_SOL,
    hops,
    stoppedBy,
    resolvedAt,
  };
}

export async function storeCachedTrace(
  userId: string,
  tracerType: TracerType,
  startAddress: string,
  minLamports: number,
  maxLamports: number,
  hops: AddressTraceHop[],
  stoppedBy: AddressTraceStoppedBy
): Promise<void> {
  await query(
    `INSERT INTO address_trace_cache
       (id, user_id, tracer_type, start_address, min_lamports, max_lamports, journal_json, stopped_by, resolved_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id, tracer_type, start_address, min_lamports, max_lamports)
     DO UPDATE SET journal_json = $6, stopped_by = $7, resolved_at = NOW()`,
    [userId, tracerType, startAddress, minLamports, maxLamports, JSON.stringify(hops), stoppedBy]
  );
}

/**
 * Supprime l'entrée cache exactement identifiée par (user, tracer, start, fenêtre).
 * Renvoie le nombre de lignes supprimées (0 si aucun cache n'existait).
 */
export async function deleteCachedTrace(
  userId: string,
  tracerType: TracerType,
  startAddress: string,
  minLamports: number,
  maxLamports: number
): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM address_trace_cache
     WHERE user_id = $1
       AND tracer_type = $2
       AND start_address = $3
       AND min_lamports = $4
       AND max_lamports = $5
     RETURNING id`,
    [userId, tracerType, startAddress, minLamports, maxLamports]
  );
  return rows.length;
}
