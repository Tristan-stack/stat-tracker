import { query } from '@/lib/db';
import { getTokenWithMetrics } from '@/lib/token-calculations';
import type { Token } from '@/types/token';

interface DbRuggerToken {
  id: string;
  name: string;
  token_name: string | null;
  token_address: string | null;
  entry_price: number;
  high: number;
  low: number;
  target_exit_percent: number;
  status_id: string;
  purchased_at: string | null;
  created_at: string;
}

interface TrendSlice {
  tokenCount: number;
  avgMaxGainPercent: number;
  avgMaxLossPercent: number;
  targetHitRatePercent: number;
}

export interface RuggerAiContext {
  ruggerId: string;
  tokenCount: number;
  nowIso: string;
  tokens: Token[];
  trends: {
    last7d: TrendSlice;
    last14d: TrendSlice;
    last30d: TrendSlice;
    previous30d: TrendSlice;
  };
  statusBreakdown: Record<string, number>;
  latestAnalysis: {
    id: string;
    status: string;
    buyerCount: number;
    tokenCount: number;
    avgCoveragePercent: number | null;
    avgMatchingConfidence: number | null;
    completedAt: string | null;
  } | null;
}

function buildTrendSlice(tokens: Token[]): TrendSlice {
  if (tokens.length === 0) {
    return {
      tokenCount: 0,
      avgMaxGainPercent: 0,
      avgMaxLossPercent: 0,
      targetHitRatePercent: 0,
    };
  }
  const metrics = tokens.map(getTokenWithMetrics);
  const sumGain = metrics.reduce((acc, item) => acc + item.maxGainPercent, 0);
  const sumLoss = metrics.reduce((acc, item) => acc + item.maxLossPercent, 0);
  const hits = metrics.filter((item) => item.targetReached).length;
  return {
    tokenCount: tokens.length,
    avgMaxGainPercent: sumGain / tokens.length,
    avgMaxLossPercent: sumLoss / tokens.length,
    targetHitRatePercent: (hits / tokens.length) * 100,
  };
}

function toToken(row: DbRuggerToken): Token {
  return {
    id: row.id,
    name: row.name,
    tokenName: row.token_name ?? undefined,
    tokenAddress: row.token_address ?? undefined,
    entryPrice: row.entry_price,
    high: row.high,
    low: row.low,
    targetExitPercent: row.target_exit_percent,
    statusId: row.status_id as Token['statusId'],
    purchasedAt: row.purchased_at ?? row.created_at,
  };
}

function isAfter(dateIso: string | undefined, thresholdMs: number): boolean {
  if (!dateIso) return false;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() >= thresholdMs;
}

export async function loadRuggerAiContext(ruggerId: string): Promise<RuggerAiContext> {
  const rows = await query<DbRuggerToken>(
    `
      select
        id,
        name,
        token_name,
        token_address,
        entry_price,
        high,
        low,
        target_exit_percent,
        status_id,
        purchased_at,
        created_at
      from rugger_tokens
      where rugger_id = $1
      order by coalesce(purchased_at, created_at) desc
    `,
    [ruggerId]
  );
  const tokens = rows.map(toToken);
  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const last7d = tokens.filter((item) => isAfter(item.purchasedAt, nowMs - 7 * dayMs));
  const last14d = tokens.filter((item) => isAfter(item.purchasedAt, nowMs - 14 * dayMs));
  const last30d = tokens.filter((item) => isAfter(item.purchasedAt, nowMs - 30 * dayMs));
  const previous30d = tokens.filter((item) => {
    if (!item.purchasedAt) return false;
    const dateMs = new Date(item.purchasedAt).getTime();
    if (Number.isNaN(dateMs)) return false;
    return dateMs < nowMs - 30 * dayMs && dateMs >= nowMs - 60 * dayMs;
  });

  const statusBreakdown = tokens.reduce<Record<string, number>>((acc, item) => {
    const key = item.statusId ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const analysisRows = await query<{
    id: string;
    status: string;
    buyer_count: number;
    token_count: number;
    completed_at: string | null;
  }>(
    `
      select id, status, buyer_count, token_count, completed_at
      from wallet_analyses
      where rugger_id = $1
      order by created_at desc
      limit 1
    `,
    [ruggerId]
  );
  const latestAnalysisRow = analysisRows[0];
  let latestAnalysis: RuggerAiContext['latestAnalysis'] = null;
  if (latestAnalysisRow) {
    const buyerMetrics = await query<{
      avg_coverage_percent: number | null;
      avg_matching_confidence: number | null;
    }>(
      `
        select
          avg(coverage_percent)::float as avg_coverage_percent,
          avg(matching_confidence)::float as avg_matching_confidence
        from analysis_buyer_wallets
        where analysis_id = $1
      `,
      [latestAnalysisRow.id]
    );
    latestAnalysis = {
      id: latestAnalysisRow.id,
      status: latestAnalysisRow.status,
      buyerCount: latestAnalysisRow.buyer_count,
      tokenCount: latestAnalysisRow.token_count,
      avgCoveragePercent: buyerMetrics[0]?.avg_coverage_percent ?? null,
      avgMatchingConfidence: buyerMetrics[0]?.avg_matching_confidence ?? null,
      completedAt: latestAnalysisRow.completed_at,
    };
  }

  return {
    ruggerId,
    tokenCount: tokens.length,
    nowIso: new Date(nowMs).toISOString(),
    tokens,
    trends: {
      last7d: buildTrendSlice(last7d),
      last14d: buildTrendSlice(last14d),
      last30d: buildTrendSlice(last30d),
      previous30d: buildTrendSlice(previous30d),
    },
    statusBreakdown,
    latestAnalysis,
  };
}
