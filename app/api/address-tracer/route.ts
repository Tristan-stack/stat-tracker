import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { SOLANA_BASE58_ADDRESS } from '@/lib/solana-external-links';
import { getTracer, isTracerType } from '@/lib/address-tracer/tracers/registry';
import { AddressTracerParseError } from '@/lib/address-tracer/tracers/types';
import { resolveMaxDepth, stepAddress } from '@/lib/address-tracer/trace-engine';
import {
  deleteCachedTrace,
  loadCachedTrace,
  solToLamports,
  storeCachedTrace,
} from '@/lib/address-tracer/trace-cache';
import { getCreatedAssetsCount } from '@/lib/helius/client';
import { enterTracerThrottle } from '@/lib/helius/throttle';
import type { AddressTraceHop, AddressTraceStoppedBy, TracerType } from '@/types/address-trace';

export const maxDuration = 60;

interface ParsedInput {
  startAddress: string;
  minSol: number;
  maxSol: number;
  minLamports: number;
  maxLamports: number;
  tracerType: TracerType;
  forceRefresh: boolean;
}

type ParseResult =
  | { ok: true; value: ParsedInput }
  | { ok: false; error: string; status: number };

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseInput(body: Record<string, unknown>): ParseResult {
  const startAddress = typeof body.startAddress === 'string' ? body.startAddress.trim() : '';
  if (!SOLANA_BASE58_ADDRESS.test(startAddress)) {
    return { ok: false, error: 'Adresse Solana invalide.', status: 400 };
  }

  const minSol = body.minSol;
  const maxSol = body.maxSol;
  if (!isFiniteNonNegativeNumber(minSol) || !isFiniteNonNegativeNumber(maxSol)) {
    return { ok: false, error: 'Fenêtre SOL invalide (min et max doivent être des nombres >= 0).', status: 400 };
  }
  if (minSol > maxSol) {
    return { ok: false, error: 'Fenêtre SOL invalide (min ≤ max requis).', status: 400 };
  }

  const tracerType = typeof body.tracerType === 'string' ? body.tracerType : '';
  if (!isTracerType(tracerType)) {
    return { ok: false, error: 'Type de tracer inconnu.', status: 400 };
  }

  const forceRefresh = body.forceRefresh === true;

  return {
    ok: true,
    value: {
      startAddress,
      minSol,
      maxSol,
      minLamports: solToLamports(minSol),
      maxLamports: solToLamports(maxSol),
      tracerType,
      forceRefresh,
    },
  };
}

/**
 * Pour chaque adresse rencontrée, on interroge Helius DAS au plus une fois
 * par flux pour récupérer le nombre de tokens fongibles créés. Les erreurs
 * sont silencieuses (le badge créateur n'est qu'informatif).
 */
function makeCreatorCounter(): (address: string) => Promise<number> {
  const cache = new Map<string, number>();
  return async (address: string) => {
    const cached = cache.get(address);
    if (typeof cached === 'number') return cached;
    let count = 0;
    try {
      count = await getCreatedAssetsCount(address);
    } catch {
      count = 0;
    }
    cache.set(address, count);
    return count;
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const input = parsed.value;
  const tracer = getTracer(input.tracerType);
  if (!tracer) {
    return NextResponse.json({ error: 'Type de tracer inconnu.' }, { status: 400 });
  }

  const maxDepth = resolveMaxDepth();
  const encoder = new TextEncoder();
  const getCreatorCount = makeCreatorCounter();

  const streamBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Le tracer enchaîne des appels Helius séquentiels : on bascule tout ce trace sur son
      // propre throttle (HELIUS_TRACER_RPS) pour ne pas être bridé par le débit de l'analyse.
      enterTracerThrottle();
      const push = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      const enrichHopWithCreator = async (hop: AddressTraceHop): Promise<AddressTraceHop> => {
        const count = await getCreatorCount(hop.to);
        return { ...hop, toCreatorCount: count };
      };

      const finalizeAndStore = async (hops: AddressTraceHop[], stoppedBy: AddressTraceStoppedBy) => {
        try {
          await storeCachedTrace(
            userId,
            input.tracerType,
            input.startAddress,
            input.minLamports,
            input.maxLamports,
            hops,
            stoppedBy
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          push({ type: 'progress', message: `Avertissement : cache non écrit (${msg.slice(0, 120)}).` });
        }
        push({ type: 'done', stoppedBy, fullJournal: hops, fromCache: false });
      };

      try {
        const startCreatorCount = await getCreatorCount(input.startAddress);
        push({
          type: 'started',
          startAddress: input.startAddress,
          tracerType: input.tracerType,
          minSol: input.minSol,
          maxSol: input.maxSol,
          startCreatorCount,
        });

        if (!input.forceRefresh) {
          const cached = await loadCachedTrace(
            userId,
            input.tracerType,
            input.startAddress,
            input.minLamports,
            input.maxLamports
          );
          if (cached) {
            push({ type: 'progress', message: 'Cache trouvé — restitution du dernier traçage.' });
            const enrichedHops: AddressTraceHop[] = [];
            for (const hop of cached.hops) {
              if (req.signal.aborted) {
                push({ type: 'cancelled', message: 'Requête annulée par le client.' });
                controller.close();
                return;
              }
              const enriched = await enrichHopWithCreator(hop);
              enrichedHops.push(enriched);
              push({ type: 'hop', hop: enriched });
            }
            push({
              type: 'done',
              stoppedBy: cached.stoppedBy,
              fullJournal: enrichedHops,
              fromCache: true,
            });
            controller.close();
            return;
          }
        }

        let currentAddress = input.startAddress;
        const visited = new Set<string>([input.startAddress]);
        let sinceTimestamp: number | null = null;
        let depthReached = 0;
        let hops: AddressTraceHop[] = [];

        while (true) {
          if (req.signal.aborted) {
            push({ type: 'cancelled', message: 'Requête annulée par le client.' });
            controller.close();
            return;
          }

          push({
            type: 'progress',
            message: `Lecture des transactions de ${currentAddress.slice(0, 8)}…`,
            depth: depthReached,
          });

          const step = await stepAddress({
            currentAddress,
            visited,
            minLamports: input.minLamports,
            maxLamports: input.maxLamports,
            tracer,
            sinceTimestamp,
            depthReached,
            maxDepth,
            tracerType: input.tracerType,
          });

          if (step.kind === 'stop') {
            await finalizeAndStore(hops, step.stoppedBy);
            controller.close();
            return;
          }

          const enrichedHop = await enrichHopWithCreator(step.hop);
          hops = [...hops, enrichedHop];
          visited.add(enrichedHop.to);
          currentAddress = enrichedHop.to;
          sinceTimestamp = step.nextSinceTimestamp;
          depthReached += 1;

          push({ type: 'hop', hop: enrichedHop });

          if (depthReached >= maxDepth) {
            await finalizeAndStore(hops, 'depth');
            controller.close();
            return;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof AddressTracerParseError) {
          push({ type: 'error', error: `Parsing 7Srsw impossible : ${msg}` });
        } else {
          push({ type: 'error', error: msg });
        }
        controller.close();
      }
    },
  });

  return new Response(streamBody, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const input = parsed.value;

  try {
    const deleted = await deleteCachedTrace(
      userId,
      input.tracerType,
      input.startAddress,
      input.minLamports,
      input.maxLamports
    );
    return NextResponse.json({ deleted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
