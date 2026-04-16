import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
import { buildPurchasePreviews } from '@/lib/gmgn/wallet-purchases';
import { rankBestWallets, type BestWalletResult, type WalletTokenPreview } from '@/lib/analysis/best-wallet';
import { computeTieCapMeta, resolveBestWalletTieMax } from '@/lib/analysis/best-wallet-tie';
import {
  getBestWalletCacheStats,
  getBestWalletResponseCache,
  getWalletPreviewCache,
  makeBestWalletResponseCacheKey,
  makeWalletPreviewCacheKey,
  setBestWalletResponseCache,
  setWalletPreviewCache,
} from '@/lib/analysis/best-wallet-cache';
import { runWithConcurrency } from '@/lib/analysis/async-pool';

const DEFAULT_TP_MIN_PERCENT = 80;
const DEFAULT_TOKEN_LIMIT = 20;
const MAX_TOKEN_LIMIT = 40;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_WALLET_TIMEOUT_MS = 180_000;
const WALLET_PREVIEW_CACHE_TTL_MS = 30 * 60_000;
const RESPONSE_CACHE_TTL_MS = 8 * 60_000;
const DEFAULT_RETRIES = 2;

interface AnalysisGuardRow {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
}

interface TopTokenRow {
  token_address: string;
  wallet_count: number;
}

interface WalletRow {
  wallet_address: string;
  coverage_percent: number;
  active_days: number;
  candidate_token_matches: number;
  tied_at_max_count: number;
}

interface BenchmarkRow {
  wallet_count: number;
  token_count: number;
}

interface BestWalletPayload {
  topWallets: Array<BestWalletResult & { activeDays: number }>;
  meta: {
    tpMinPercent: number;
    tokenLimit: number;
    selectionPolicy: 'bestCoverageTie';
    maxTieWallets: number;
    maxCoveragePercent: number | null;
    tiedAtMaxCount: number;
    tieCapApplied: boolean;
    selectedTokenCount: number;
    scopedWalletCount: number;
    walletsAnalyzed: number;
    walletsSucceeded: number;
    walletsFailed: number;
    walletsRemaining: number;
    cacheHit: boolean;
    cacheHitResponse: boolean;
    cacheHitWalletPreviews: number;
    timingsMs: {
      total: number;
      topTokensQuery: number;
      candidateQuery: number;
      gmgnPhase: number;
      ranking: number;
    };
    benchmark: {
      walletCount: number;
      tokenCount: number;
    };
    topCoverageTokens: Array<{ tokenAddress: string; walletCount: number }>;
    partialFailures: Array<{ walletAddress: string; error: string }>;
    insufficientDataWallets: string[];
    rankingPolicy: string;
    partialMode: boolean;
    retries: number;
  };
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parsePercent(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, 1000);
}

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : '';
      const retryable = /HTTP 429|HTTP 5\d{2}|ECONNRESET|ETIMEDOUT|timeout/i.test(message);
      if (!retryable || attempt === retries) break;
      const waitMs = 300 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Wallet processing timeout (${timeoutMs}ms)`)), timeoutMs);
    }),
  ]);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; analysisId: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;
  const { id: ruggerId, analysisId } = await context.params;

  const url = new URL(req.url);
  const tpMinPercent = parsePercent(url.searchParams.get('tpMinPercent'), DEFAULT_TP_MIN_PERCENT);
  const tokenLimit = parsePositiveInt(
    url.searchParams.get('tokenLimit'),
    DEFAULT_TOKEN_LIMIT,
    MAX_TOKEN_LIMIT
  );
  const maxTieWallets = resolveBestWalletTieMax(url.searchParams.get('maxTieWallets'));
  const concurrency = parsePositiveInt(
    url.searchParams.get('concurrency'),
    Number(process.env.GMGN_BEST_WALLET_CONCURRENCY ?? DEFAULT_CONCURRENCY),
    6
  );
  const walletTimeoutMs = parsePositiveInt(
    url.searchParams.get('walletTimeoutMs'),
    Number(process.env.GMGN_BEST_WALLET_TIMEOUT_MS ?? DEFAULT_WALLET_TIMEOUT_MS),
    60_000
  );
  const retries = parsePositiveInt(
    url.searchParams.get('retries'),
    Number(process.env.GMGN_BEST_WALLET_RETRIES ?? DEFAULT_RETRIES),
    5
  );
  const startTotal = performance.now();

  const analysisGuard = await query<AnalysisGuardRow>(
    `SELECT wa.id,
            MIN(bp.purchased_at) AS starts_at,
            MAX(bp.purchased_at) AS ends_at
     FROM wallet_analyses wa
     JOIN ruggers r ON r.id = wa.rugger_id
     LEFT JOIN analysis_buyer_wallets bw ON bw.analysis_id = wa.id
     LEFT JOIN analysis_buyer_purchases bp ON bp.buyer_wallet_id = bw.id
     WHERE wa.id = $1 AND wa.rugger_id = $2 AND r.user_id = $3
     GROUP BY wa.id`,
    [analysisId, ruggerId, userId]
  );
  if (analysisGuard.length === 0) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  const benchmark = await query<BenchmarkRow>(
    `SELECT COUNT(DISTINCT bw.wallet_address)::int AS wallet_count,
            COUNT(DISTINCT bp.token_address)::int AS token_count
     FROM analysis_buyer_wallets bw
     LEFT JOIN analysis_buyer_purchases bp ON bp.buyer_wallet_id = bw.id
     WHERE bw.analysis_id = $1`,
    [analysisId]
  );

  const tTopStart = performance.now();
  const topTokens = await query<TopTokenRow>(
    `SELECT bp.token_address, COUNT(DISTINCT bp.buyer_wallet_id) AS wallet_count
     FROM analysis_buyer_purchases bp
     JOIN analysis_buyer_wallets bw ON bw.id = bp.buyer_wallet_id
     WHERE bw.analysis_id = $1
     GROUP BY bp.token_address
     ORDER BY wallet_count DESC, bp.token_address ASC
     LIMIT $2`,
    [analysisId, tokenLimit]
  );
  const topTokensQueryMs = performance.now() - tTopStart;

  if (topTokens.length === 0) {
    return NextResponse.json({
      topWallets: [],
      meta: {
        tpMinPercent,
        tokenLimit,
        selectionPolicy: 'bestCoverageTie',
        maxTieWallets,
        maxCoveragePercent: null,
        tiedAtMaxCount: 0,
        tieCapApplied: false,
        selectedTokenCount: 0,
        scopedWalletCount: 0,
        walletsAnalyzed: 0,
        walletsSucceeded: 0,
        walletsFailed: 0,
        walletsRemaining: 0,
        cacheHit: false,
        cacheHitResponse: false,
        cacheHitWalletPreviews: 0,
        timingsMs: {
          total: Math.round(performance.now() - startTotal),
          topTokensQuery: Math.round(topTokensQueryMs),
          candidateQuery: 0,
          gmgnPhase: 0,
          ranking: 0,
        },
        benchmark: {
          walletCount: Number(benchmark[0]?.wallet_count ?? 0),
          tokenCount: Number(benchmark[0]?.token_count ?? 0),
        },
        topCoverageTokens: [],
        partialFailures: [],
        insufficientDataWallets: [],
        rankingPolicy: 'coverage-first > tp-hit-rate > tp-hit-count > entry-quality',
        partialMode: false,
        retries,
      },
    });
  }

  const nowMs = Date.now();
  const startsAt = analysisGuard[0]?.starts_at ? new Date(analysisGuard[0].starts_at).getTime() : nowMs - 90 * 86400000;
  const endsAt = analysisGuard[0]?.ends_at ? new Date(analysisGuard[0].ends_at).getTime() : nowMs;
  const fromMs = Math.max(0, startsAt - 86400000);
  const toMs = Math.max(fromMs, Math.min(nowMs, endsAt + 7 * 86400000));
  const topTokenAddresses = topTokens.map((row) => row.token_address);
  const topTokenSet = new Set(topTokenAddresses);
  const responseCacheKey = makeBestWalletResponseCacheKey({
    analysisId,
    tpMinPercent,
    tokenLimit,
    maxTieWallets,
  });
  const cachedResponse = getBestWalletResponseCache<BestWalletPayload>(responseCacheKey);
  const streamRequested = url.searchParams.get('stream') === '1';
  const cacheStats = getBestWalletCacheStats();
  if (cachedResponse && !streamRequested) {
    return NextResponse.json({
      ...cachedResponse,
      meta: {
        ...cachedResponse.meta,
        cacheHit: true,
        cacheHitResponse: true,
        cacheHitWalletPreviews: cachedResponse.meta.cacheHitWalletPreviews,
        cacheStats,
      },
    });
  }

  const tCandidateStart = performance.now();
  const walletRows = await query<WalletRow>(
    `WITH top_tokens AS (
       SELECT token_address
       FROM (
         SELECT bp.token_address, COUNT(DISTINCT bp.buyer_wallet_id) AS wallet_count
         FROM analysis_buyer_purchases bp
         JOIN analysis_buyer_wallets bw ON bw.id = bp.buyer_wallet_id
         WHERE bw.analysis_id = $1
         GROUP BY bp.token_address
         ORDER BY wallet_count DESC, bp.token_address ASC
         LIMIT $2
       ) t
     ),
     wallet_stats AS (
       SELECT bw.wallet_address,
              bw.coverage_percent,
              bw.active_days::int AS active_days,
              COUNT(DISTINCT CASE WHEN bp.token_address IN (SELECT token_address FROM top_tokens)
                   THEN bp.token_address END)::int AS candidate_token_matches
       FROM analysis_buyer_wallets bw
       LEFT JOIN analysis_buyer_purchases bp ON bp.buyer_wallet_id = bw.id
       WHERE bw.analysis_id = $1
       GROUP BY bw.wallet_address, bw.coverage_percent, bw.active_days
     ),
     max_cov AS (
       SELECT MAX(ws.coverage_percent) AS m FROM wallet_stats ws
     ),
     tied AS (
       SELECT ws.wallet_address,
              ws.coverage_percent,
              ws.active_days,
              ws.candidate_token_matches,
              COUNT(*) OVER ()::int AS tied_at_max_count
       FROM wallet_stats ws
       CROSS JOIN max_cov mc
       WHERE ws.coverage_percent = mc.m
     ),
     ranked AS (
       SELECT t.*, ROW_NUMBER() OVER (
         ORDER BY t.candidate_token_matches DESC, t.wallet_address ASC
       )::int AS rn
       FROM tied t
     )
     SELECT wallet_address,
            coverage_percent,
            active_days,
            candidate_token_matches,
            tied_at_max_count
     FROM ranked
     WHERE rn <= $3`,
    [analysisId, tokenLimit, maxTieWallets]
  );
  const candidateQueryMs = performance.now() - tCandidateStart;

  const partialFailures: Array<{ walletAddress: string; error: string }> = [];
  const insufficientDataWallets: string[] = [];

  const buildPayload = async (
    onProgress?: (event: {
      message: string;
      totalWallets: number;
      walletsAnalyzed: number;
      walletsRemaining: number;
      walletsSucceeded: number;
      walletsFailed: number;
      currentWallet: string;
    }) => void
  ): Promise<BestWalletPayload> => {
    const gmgnPhaseStart = performance.now();
    const candidates: Array<{
      walletAddress: string;
      analysisCoveragePercent: number;
      previews: WalletTokenPreview[];
    }> = [];
    let walletsAnalyzed = 0;
    let walletsSucceeded = 0;
    let walletsFailed = 0;
    let cacheHitWalletPreviews = 0;

    const processed = await runWithConcurrency(walletRows, concurrency, async (wallet) => {
      const previewCacheKey = makeWalletPreviewCacheKey({
        analysisId,
        walletAddress: wallet.wallet_address,
        fromMs,
        toMs,
      });
      const cachedPreviews = getWalletPreviewCache<WalletTokenPreview[]>(previewCacheKey);
      if (cachedPreviews) {
        cacheHitWalletPreviews += 1;
        walletsAnalyzed += 1;
        walletsSucceeded += 1;
        onProgress?.({
          message: `Wallet ${wallet.wallet_address} analysé depuis cache (${walletsAnalyzed}/${walletRows.length})`,
          totalWallets: walletRows.length,
          walletsAnalyzed,
          walletsRemaining: Math.max(0, walletRows.length - walletsAnalyzed),
          walletsSucceeded,
          walletsFailed,
          currentWallet: wallet.wallet_address,
        });
        return {
          walletAddress: wallet.wallet_address,
          analysisCoveragePercent: wallet.coverage_percent,
          previews: cachedPreviews,
        };
      }

      try {
        const previews = await withTimeout(
          withRetry(() => buildPurchasePreviews(wallet.wallet_address, fromMs, toMs), retries),
          walletTimeoutMs
        );
        const filteredPreviews: WalletTokenPreview[] = previews
          .filter((preview) => topTokenSet.has(preview.tokenAddress))
          .map((preview) => ({
            tokenAddress: preview.tokenAddress,
            entryPrice: preview.entryPrice,
            high: preview.high,
          }));
        setWalletPreviewCache(previewCacheKey, filteredPreviews, WALLET_PREVIEW_CACHE_TTL_MS);
        if (filteredPreviews.length === 0) insufficientDataWallets.push(wallet.wallet_address);
        walletsSucceeded += 1;
        return {
          walletAddress: wallet.wallet_address,
          analysisCoveragePercent: wallet.coverage_percent,
          previews: filteredPreviews,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview collection failed';
        partialFailures.push({ walletAddress: wallet.wallet_address, error: message });
        walletsFailed += 1;
        return {
          walletAddress: wallet.wallet_address,
          analysisCoveragePercent: wallet.coverage_percent,
          previews: [] as WalletTokenPreview[],
        };
      } finally {
        walletsAnalyzed += 1;
        onProgress?.({
          message: `Wallet ${wallet.wallet_address} traité (${walletsAnalyzed}/${walletRows.length})`,
          totalWallets: walletRows.length,
          walletsAnalyzed,
          walletsRemaining: Math.max(0, walletRows.length - walletsAnalyzed),
          walletsSucceeded,
          walletsFailed,
          currentWallet: wallet.wallet_address,
        });
      }
    });
    candidates.push(...processed);
    const gmgnPhaseMs = performance.now() - gmgnPhaseStart;
    const rankingPhaseStart = performance.now();
    const ranked = rankBestWallets(candidates, topTokenAddresses, tpMinPercent);
    const activeByWallet = new Map(walletRows.map((w) => [w.wallet_address, w.active_days]));
    const topWallets: Array<BestWalletResult & { activeDays: number }> = ranked.map((row) => ({
      ...row,
      activeDays: activeByWallet.get(row.walletAddress) ?? 0,
    }));
    const rankingMs = performance.now() - rankingPhaseStart;
    const totalMs = performance.now() - startTotal;

    const tiedAtMaxCount = walletRows[0]?.tied_at_max_count ?? 0;
    const maxCoveragePercent = walletRows.length > 0 ? walletRows[0].coverage_percent : null;
    const { tieCapApplied } = computeTieCapMeta(tiedAtMaxCount, walletRows.length, maxTieWallets);

    return {
      topWallets,
      meta: {
        tpMinPercent,
        tokenLimit,
        selectionPolicy: 'bestCoverageTie',
        maxTieWallets,
        maxCoveragePercent,
        tiedAtMaxCount,
        tieCapApplied,
        selectedTokenCount: topTokenAddresses.length,
        scopedWalletCount: walletRows.length,
        walletsAnalyzed,
        walletsSucceeded,
        walletsFailed,
        walletsRemaining: Math.max(0, walletRows.length - walletsAnalyzed),
        cacheHit: cacheHitWalletPreviews > 0,
        cacheHitResponse: false,
        cacheHitWalletPreviews,
        timingsMs: {
          total: Math.round(totalMs),
          topTokensQuery: Math.round(topTokensQueryMs),
          candidateQuery: Math.round(candidateQueryMs),
          gmgnPhase: Math.round(gmgnPhaseMs),
          ranking: Math.round(rankingMs),
        },
        benchmark: {
          walletCount: Number(benchmark[0]?.wallet_count ?? 0),
          tokenCount: Number(benchmark[0]?.token_count ?? 0),
        },
        topCoverageTokens: topTokens.map((token) => ({
          tokenAddress: token.token_address,
          walletCount: Number(token.wallet_count),
        })),
        partialFailures,
        insufficientDataWallets,
        rankingPolicy: 'coverage-first > tp-hit-rate > tp-hit-count > entry-quality',
        partialMode: partialFailures.length > 0,
        retries,
      },
    };
  };

  if (!streamRequested) {
    const payload = await buildPayload();
    setBestWalletResponseCache(responseCacheKey, payload, RESPONSE_CACHE_TTL_MS);
    return NextResponse.json(payload);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      try {
        send({
          type: 'started',
          totalWallets: walletRows.length,
          selectedTokenCount: topTokenAddresses.length,
          tpMinPercent,
          message: 'Démarrage de l’analyse Best Wallet',
        });
        const payload = await buildPayload((progress) => {
          send({ type: 'progress', ...progress });
        });
        setBestWalletResponseCache(responseCacheKey, payload, RESPONSE_CACHE_TTL_MS);
        send({ type: 'done', payload });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Best wallet stream failed';
        send({ type: 'error', error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
