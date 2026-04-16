import { NextRequest, NextResponse } from 'next/server';
import { runWithConcurrency } from '@/lib/analysis/async-pool';
import { requireUser } from '@/lib/auth-session';
import { mergeWalletPreviewsToBestBuyPerMint } from '@/lib/gmgn/merge-best-buy-per-mint';
import { buildPurchasePreviews } from '@/lib/gmgn/wallet-purchases';
import { computeBestEntryOnCommonMints } from '@/lib/wallet-comparison/best-entry-on-common-mints';

const MAX_WALLETS = 10;
const DEFAULT_RANGE_MS = 180 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 2;

type BestMintMap = ReturnType<typeof mergeWalletPreviewsToBestBuyPerMint>;

function normalizeWalletList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (t === '') continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

interface ParsedBounds {
  fromMs: number;
  toMs: number;
}

interface ParsedInput {
  wallets: string[];
  bounds: ParsedBounds;
  stream: boolean;
}

function parseInput(body: Record<string, unknown>): { ok: true; value: ParsedInput } | { ok: false; error: string; status: number } {
  const wallets = normalizeWalletList(body.walletAddresses);
  if (wallets.length < 2) {
    return { ok: false, error: 'Au moins 2 adresses wallet distinctes sont requises.', status: 400 };
  }
  if (wallets.length > MAX_WALLETS) {
    return { ok: false, error: `Maximum ${MAX_WALLETS} wallets par comparaison.`, status: 400 };
  }

  const now = Date.now();
  const fromMs =
    typeof body.fromMs === 'number' && Number.isFinite(body.fromMs)
      ? body.fromMs
      : now - DEFAULT_RANGE_MS;
  const toMs = typeof body.toMs === 'number' && Number.isFinite(body.toMs) ? body.toMs : now;
  if (fromMs > toMs) {
    return { ok: false, error: 'fromMs must be <= toMs', status: 400 };
  }

  const stream = body.stream === true;
  return { ok: true, value: { wallets, bounds: { fromMs, toMs }, stream } };
}

function buildJsonPayload(
  orderedOk: string[],
  walletMaps: Map<string, BestMintMap>,
  partialFailures: Array<{ walletAddress: string; error: string }>,
  bounds: ParsedBounds
) {
  const computed = computeBestEntryOnCommonMints(orderedOk, walletMaps);
  return {
    fromMs: bounds.fromMs,
    toMs: bounds.toMs,
    walletsCompared: orderedOk,
    skippedWallets: partialFailures,
    commonMintCount: computed.commonMintCount,
    globalWinnerWallets: computed.globalWinnerWallets,
    scores: computed.scores,
    perMint: computed.perMint,
  };
}

async function fetchAllWalletsParallel(
  wallets: string[],
  fromMs: number,
  toMs: number
): Promise<{
  partialFailures: Array<{ walletAddress: string; error: string }>;
  orderedOk: string[];
  walletMaps: Map<string, BestMintMap>;
}> {
  type FetchResult =
    | { walletAddress: string; ok: true; map: BestMintMap }
    | { walletAddress: string; ok: false; error: string };

  const results: FetchResult[] = await runWithConcurrency(
    wallets,
    CONCURRENCY,
    async (walletAddress): Promise<FetchResult> => {
      try {
        const previews = await buildPurchasePreviews(walletAddress, fromMs, toMs);
        return {
          walletAddress,
          ok: true,
          map: mergeWalletPreviewsToBestBuyPerMint(previews),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { walletAddress, ok: false, error: msg };
      }
    }
  );

  const partialFailures: Array<{ walletAddress: string; error: string }> = [];
  const walletMaps = new Map<string, BestMintMap>();
  const orderedOk: string[] = [];

  for (const r of results) {
    if (!r.ok) {
      partialFailures.push({ walletAddress: r.walletAddress, error: r.error });
      continue;
    }
    orderedOk.push(r.walletAddress);
    walletMaps.set(r.walletAddress, r.map);
  }

  return { partialFailures, orderedOk, walletMaps };
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const { wallets, bounds, stream } = parsed.value;
  const { fromMs, toMs } = bounds;

  if (stream) {
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      async start(controller) {
        const push = (obj: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };

        const partialFailures: Array<{ walletAddress: string; error: string }> = [];
        const walletMaps = new Map<string, BestMintMap>();
        const orderedOk: string[] = [];

        try {
          push({
            type: 'started',
            totalWallets: wallets.length,
            message: `Comparaison : ${wallets.length} wallet(s), GMGN sur la période sélectionnée.`,
          });

          for (let i = 0; i < wallets.length; i += 1) {
            if (req.signal.aborted) {
              push({ type: 'cancelled', message: 'Requête annulée par le client.' });
              controller.close();
              return;
            }

            const walletAddress = wallets[i]!;
            push({
              type: 'progress',
              message: `GMGN ${i + 1}/${wallets.length} — ${walletAddress.slice(0, 8)}…`,
              index: i + 1,
              total: wallets.length,
              currentWallet: walletAddress,
            });

            try {
              const previews = await buildPurchasePreviews(walletAddress, fromMs, toMs);
              const map = mergeWalletPreviewsToBestBuyPerMint(previews);
              orderedOk.push(walletAddress);
              walletMaps.set(walletAddress, map);
              push({
                type: 'wallet_done',
                walletAddress,
                ok: true,
                mintCount: map.size,
                message: `${map.size} mint(s) retenu(s) après dédup.`,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              partialFailures.push({ walletAddress, error: msg });
              push({
                type: 'wallet_done',
                walletAddress,
                ok: false,
                error: msg,
                message: `Échec GMGN : ${msg.slice(0, 120)}`,
              });
            }
          }

          if (orderedOk.length < 2) {
            push({
              type: 'error',
              error: 'Pas assez de wallets exploitables après les appels GMGN.',
              partialFailures,
            });
            controller.close();
            return;
          }

          push({ type: 'progress', message: 'Calcul de l’intersection et du classement…' });

          const payload = buildJsonPayload(orderedOk, walletMaps, partialFailures, bounds);
          push({ type: 'done', payload });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          push({ type: 'error', error: msg });
        } finally {
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

  const { partialFailures, orderedOk, walletMaps } = await fetchAllWalletsParallel(wallets, fromMs, toMs);

  if (orderedOk.length < 2) {
    return NextResponse.json(
      {
        error: 'Pas assez de wallets exploitables après les appels GMGN.',
        partialFailures,
      },
      { status: 422 }
    );
  }

  return NextResponse.json(buildJsonPayload(orderedOk, walletMaps, partialFailures, bounds));
}
