import { query } from '@/lib/db';
import type {
  WalletAnalysis,
  AnalysisMode,
  AnalysisStatus,
  AnalysisMotherAddress,
} from '@/types/analysis';

// ---------------------------------------------------------------------------
// wallet_analyses
// ---------------------------------------------------------------------------

export interface AnalysisRow {
  id: string;
  rugger_id: string;
  mode: string;
  status: string;
  funding_depth: number;
  buyer_limit: number;
  token_count: number;
  buyer_count: number;
  progress: number;
  progress_label: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const ANALYSIS_COLS =
  'id, rugger_id, mode, status, funding_depth, buyer_limit, token_count, buyer_count, progress, progress_label, error_message, created_at, completed_at';

/** Point unique de mapping analyse snake_case → WalletAnalysis. */
export function mapAnalysis(r: AnalysisRow): WalletAnalysis {
  return {
    id: r.id,
    ruggerId: r.rugger_id,
    mode: r.mode as AnalysisMode,
    status: r.status as AnalysisStatus,
    fundingDepth: r.funding_depth,
    buyerLimit: r.buyer_limit,
    tokenCount: r.token_count,
    buyerCount: r.buyer_count,
    progress: r.progress,
    progressLabel: r.progress_label,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

export async function listAnalyses(ruggerId: string): Promise<WalletAnalysis[]> {
  const rows = await query<AnalysisRow>(
    `SELECT ${ANALYSIS_COLS} FROM wallet_analyses WHERE rugger_id = $1 ORDER BY created_at DESC`,
    [ruggerId]
  );
  return rows.map(mapAnalysis);
}

export async function getAnalysisForUser(
  analysisId: string,
  ruggerId: string,
  userId: string
): Promise<WalletAnalysis | null> {
  const rows = await query<AnalysisRow>(
    `SELECT wa.id, wa.rugger_id, wa.mode, wa.status, wa.funding_depth, wa.buyer_limit,
            wa.token_count, wa.buyer_count, wa.progress, wa.progress_label,
            wa.error_message, wa.created_at, wa.completed_at
     FROM wallet_analyses wa
     JOIN ruggers r ON r.id = wa.rugger_id
     WHERE wa.id = $1 AND wa.rugger_id = $2 AND r.user_id = $3`,
    [analysisId, ruggerId, userId]
  );
  return rows[0] ? mapAnalysis(rows[0]) : null;
}

/** Vérifie qu'une analyse appartient au user (via JOIN ruggers). */
export async function analysisOwnedByUser(
  analysisId: string,
  ruggerId: string,
  userId: string
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT wa.id FROM wallet_analyses wa
     JOIN ruggers r ON r.id = wa.rugger_id
     WHERE wa.id = $1 AND wa.rugger_id = $2 AND r.user_id = $3`,
    [analysisId, ruggerId, userId]
  );
  return rows.length > 0;
}

export async function deleteAnalysisForUser(
  analysisId: string,
  ruggerId: string,
  userId: string
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM wallet_analyses wa
     USING ruggers r
     WHERE wa.id = $1 AND wa.rugger_id = $2 AND r.id = wa.rugger_id AND r.user_id = $3
     RETURNING wa.id`,
    [analysisId, ruggerId, userId]
  );
  return rows.length > 0;
}

export async function deleteAllAnalyses(ruggerId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `DELETE FROM wallet_analyses WHERE rugger_id = $1 RETURNING id`,
    [ruggerId]
  );
  return rows.length;
}

export async function createAnalysis(args: {
  ruggerId: string;
  mode: AnalysisMode;
  fundingDepth: number;
  tokenCount: number;
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO wallet_analyses (id, rugger_id, mode, status, funding_depth, buyer_limit, token_count)
     VALUES (gen_random_uuid(), $1, $2, 'pending', $3, 200, $4)
     RETURNING id`,
    [args.ruggerId, args.mode, args.fundingDepth, args.tokenCount]
  );
  return rows[0].id;
}

/** Tokens (mint + nom) d'un rugger pour alimenter le pipeline d'analyse. */
export async function getRuggerTokenAddresses(
  ruggerId: string
): Promise<{ address: string; name: string | null }[]> {
  const rows = await query<{ token_address: string; token_name: string | null }>(
    `SELECT token_address, token_name FROM rugger_tokens WHERE rugger_id = $1 AND token_address IS NOT NULL`,
    [ruggerId]
  );
  return rows.map((t) => ({ address: t.token_address, name: t.token_name }));
}

// ---------------------------------------------------------------------------
// analysis_buyer_wallets (leaderboard)
// ---------------------------------------------------------------------------

interface BuyerWalletRow {
  id: string;
  wallet_address: string;
  source: string;
  tokens_bought: number;
  total_tokens: number;
  coverage_percent: number;
  first_buy_at: string | null;
  last_buy_at: string | null;
  active_days: number;
  span_days_in_scope: number;
  consistency: number;
  weight: number;
  avg_hold_duration_hours: number | null;
  funding_depth: number | null;
  funding_chain: string | null;
  mother_address: string | null;
  mother_child_count: number;
  has_high_fanout_mother: boolean;
  matching_confidence: number;
  inclusion_decision: 'included' | 'excluded' | 'included_with_risk';
  risk_flag: string | null;
  risk_level: 'low' | 'medium' | 'high' | null;
  decision_reasons: unknown;
}

export interface BuyerWalletListItem {
  id: string;
  walletAddress: string;
  source: string;
  tokensBought: number;
  totalTokens: number;
  coveragePercent: number;
  firstBuyAt: string | null;
  lastBuyAt: string | null;
  activeDays: number;
  spanDaysInScope: number;
  consistency: number;
  weight: number;
  avgHoldDuration: number | null;
  fundingDepth: number | null;
  fundingChain: string[] | null;
  motherAddress: string | null;
  motherChildCount: number;
  hasHighFanoutMother: boolean;
  matchingConfidence: number;
  inclusionDecision: 'included' | 'excluded' | 'included_with_risk';
  riskFlag: string | null;
  riskLevel: 'low' | 'medium' | 'high' | null;
  decisionReasons: string[];
}

function mapBuyerWallet(r: BuyerWalletRow): BuyerWalletListItem {
  return {
    id: r.id,
    walletAddress: r.wallet_address,
    source: r.source,
    tokensBought: r.tokens_bought,
    totalTokens: r.total_tokens,
    coveragePercent: r.coverage_percent,
    firstBuyAt: r.first_buy_at,
    lastBuyAt: r.last_buy_at,
    activeDays: r.active_days,
    spanDaysInScope: r.span_days_in_scope,
    consistency: r.consistency,
    weight: r.weight,
    avgHoldDuration: r.avg_hold_duration_hours,
    fundingDepth: r.funding_depth,
    fundingChain: r.funding_chain ? (JSON.parse(r.funding_chain) as string[]) : null,
    motherAddress: r.mother_address,
    motherChildCount: r.mother_child_count,
    hasHighFanoutMother: r.has_high_fanout_mother,
    matchingConfidence: r.matching_confidence,
    inclusionDecision: r.inclusion_decision,
    riskFlag: r.risk_flag,
    riskLevel: r.risk_level,
    decisionReasons: Array.isArray(r.decision_reasons) ? (r.decision_reasons as string[]) : [],
  };
}

/** Colonnes triables (whitelist anti-injection). */
const VALID_SORT_FIELDS: Record<string, string> = {
  consistency: 'bw.consistency',
  weight: 'bw.weight',
  coverage: 'bw.coverage_percent',
  tokensBought: 'bw.tokens_bought',
  activeDays: 'bw.active_days',
  spanDays: 'bw.span_days_in_scope',
  confidence: 'bw.matching_confidence',
};

function buildOrderBy(sortParam: string, sortBy: string): string {
  const parsed = sortParam
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((entry) => {
      const [fieldRaw, dirRaw] = entry.split(':');
      const column = VALID_SORT_FIELDS[fieldRaw?.trim() ?? ''];
      if (!column) return null;
      const direction = dirRaw?.trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      return `${column} ${direction}`;
    })
    .filter((v): v is string => v !== null);

  if (parsed.length > 0) return parsed.join(', ');
  return `${VALID_SORT_FIELDS[sortBy] ?? 'bw.coverage_percent'} DESC`;
}

export async function listBuyerWallets(args: {
  analysisId: string;
  sortParam: string;
  sortBy: string;
  search: string;
  limit: number;
  offset: number;
}): Promise<{ wallets: BuyerWalletListItem[]; total: number }> {
  const params: (string | number)[] = [args.analysisId];
  const whereClauses = ['bw.analysis_id = $1'];
  if (args.search !== '') {
    params.push(`%${args.search}%`);
    whereClauses.push(`bw.wallet_address ILIKE $${params.length}`);
  }
  const whereClause = whereClauses.join(' AND ');
  const orderBy = buildOrderBy(args.sortParam, args.sortBy);

  const rows = await query<BuyerWalletRow>(
    `SELECT bw.id, bw.wallet_address, bw.source,
            bw.tokens_bought, bw.total_tokens, bw.coverage_percent,
            bw.first_buy_at, bw.last_buy_at, bw.active_days, bw.span_days_in_scope,
            bw.consistency, bw.weight, bw.avg_hold_duration_hours,
            bw.funding_depth, bw.funding_chain,
            ma.address AS mother_address,
            bw.mother_child_count, bw.has_high_fanout_mother,
            bw.matching_confidence, bw.inclusion_decision, bw.risk_flag, bw.risk_level, bw.decision_reasons
     FROM analysis_buyer_wallets bw
     LEFT JOIN analysis_mother_addresses ma ON ma.id = bw.mother_address_id
     WHERE ${whereClause}
     ORDER BY ${orderBy}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, args.limit, args.offset]
  );

  const countRows = await query<{ total: string }>(
    `SELECT count(*) AS total FROM analysis_buyer_wallets bw WHERE ${whereClause}`,
    params
  );

  return { wallets: rows.map(mapBuyerWallet), total: Number(countRows[0]?.total ?? 0) };
}

export interface BuyerWalletDetail extends BuyerWalletListItem {
  purchases: Array<{
    id: string;
    tokenAddress: string;
    tokenName: string | null;
    purchasedAt: string | null;
    amountSol: number | null;
  }>;
}

/** Détail d'un wallet acheteur (avec ses achats), borné par propriété user. */
export async function getBuyerWalletDetail(
  analysisId: string,
  walletAddress: string,
  ruggerId: string,
  userId: string
): Promise<BuyerWalletDetail | null> {
  const rows = await query<BuyerWalletRow>(
    `SELECT bw.id, bw.wallet_address, bw.source,
            bw.tokens_bought, bw.total_tokens, bw.coverage_percent,
            bw.first_buy_at, bw.last_buy_at, bw.active_days, bw.span_days_in_scope,
            bw.consistency, bw.weight, bw.avg_hold_duration_hours,
            bw.funding_depth, bw.funding_chain,
            ma.address AS mother_address,
            bw.mother_child_count, bw.has_high_fanout_mother,
            bw.matching_confidence, bw.inclusion_decision, bw.risk_flag, bw.risk_level, bw.decision_reasons
     FROM analysis_buyer_wallets bw
     JOIN wallet_analyses wa ON wa.id = bw.analysis_id
     JOIN ruggers r ON r.id = wa.rugger_id
     LEFT JOIN analysis_mother_addresses ma ON ma.id = bw.mother_address_id
     WHERE bw.analysis_id = $1 AND bw.wallet_address = $2 AND wa.rugger_id = $3 AND r.user_id = $4`,
    [analysisId, walletAddress, ruggerId, userId]
  );
  const row = rows[0];
  if (!row) return null;

  const purchaseRows = await query<{
    id: string;
    token_address: string;
    token_name: string | null;
    purchased_at: string | null;
    amount_sol: number | null;
  }>(
    `SELECT bp.id, bp.token_address, bp.token_name, bp.purchased_at, bp.amount_sol
     FROM analysis_buyer_purchases bp
     WHERE bp.buyer_wallet_id = $1
     ORDER BY bp.purchased_at ASC NULLS LAST`,
    [row.id]
  );

  return {
    ...mapBuyerWallet(row),
    purchases: purchaseRows.map((p) => ({
      id: p.id,
      tokenAddress: p.token_address,
      tokenName: p.token_name,
      purchasedAt: p.purchased_at,
      amountSol: p.amount_sol,
    })),
  };
}

/** Paires (wallet, token acheté) d'une analyse (optimiseur de combinaisons). */
export async function getBuyerWalletTokenPairs(
  analysisId: string
): Promise<Array<{ walletAddress: string; tokenAddress: string }>> {
  const rows = await query<{ wallet_address: string; token_address: string }>(
    `SELECT bw.wallet_address, bp.token_address
     FROM analysis_buyer_wallets bw
     JOIN analysis_buyer_purchases bp ON bp.buyer_wallet_id = bw.id
     WHERE bw.analysis_id = $1`,
    [analysisId]
  );
  return rows.map((r) => ({ walletAddress: r.wallet_address, tokenAddress: r.token_address }));
}

/** Adresses des wallets acheteurs d'une analyse (cross-rugger). */
export async function getBuyerWalletAddresses(analysisId: string): Promise<string[]> {
  const rows = await query<{ wallet_address: string }>(
    'SELECT wallet_address FROM analysis_buyer_wallets WHERE analysis_id = $1',
    [analysisId]
  );
  return rows.map((r) => r.wallet_address);
}

// ---------------------------------------------------------------------------
// best-wallet (requêtes SQL extraites ; l'orchestration cache/GMGN/ranking
// reste dans la route)
// ---------------------------------------------------------------------------

export interface BestWalletTopTokenRow {
  token_address: string;
  wallet_count: number;
}

export interface BestWalletCandidateRow {
  wallet_address: string;
  coverage_percent: number;
  active_days: number;
  candidate_token_matches: number;
  tied_at_max_count: number;
}

/** Garde de propriété + bornes temporelles (min/max purchased_at) de l'analyse. */
export async function getBestWalletGuard(
  analysisId: string,
  ruggerId: string,
  userId: string
): Promise<{ starts_at: string | null; ends_at: string | null } | null> {
  const rows = await query<{ id: string; starts_at: string | null; ends_at: string | null }>(
    `SELECT wa.id, MIN(bp.purchased_at) AS starts_at, MAX(bp.purchased_at) AS ends_at
     FROM wallet_analyses wa
     JOIN ruggers r ON r.id = wa.rugger_id
     LEFT JOIN analysis_buyer_wallets bw ON bw.analysis_id = wa.id
     LEFT JOIN analysis_buyer_purchases bp ON bp.buyer_wallet_id = bw.id
     WHERE wa.id = $1 AND wa.rugger_id = $2 AND r.user_id = $3
     GROUP BY wa.id`,
    [analysisId, ruggerId, userId]
  );
  const r = rows[0];
  return r ? { starts_at: r.starts_at, ends_at: r.ends_at } : null;
}

export async function getBestWalletBenchmark(
  analysisId: string
): Promise<{ wallet_count: number; token_count: number }> {
  const rows = await query<{ wallet_count: number; token_count: number }>(
    `SELECT COUNT(DISTINCT bw.wallet_address)::int AS wallet_count,
            COUNT(DISTINCT bp.token_address)::int AS token_count
     FROM analysis_buyer_wallets bw
     LEFT JOIN analysis_buyer_purchases bp ON bp.buyer_wallet_id = bw.id
     WHERE bw.analysis_id = $1`,
    [analysisId]
  );
  return { wallet_count: Number(rows[0]?.wallet_count ?? 0), token_count: Number(rows[0]?.token_count ?? 0) };
}

export async function getTopTokens(analysisId: string, tokenLimit: number): Promise<BestWalletTopTokenRow[]> {
  return query<BestWalletTopTokenRow>(
    `SELECT bp.token_address, COUNT(DISTINCT bp.buyer_wallet_id) AS wallet_count
     FROM analysis_buyer_purchases bp
     JOIN analysis_buyer_wallets bw ON bw.id = bp.buyer_wallet_id
     WHERE bw.analysis_id = $1
     GROUP BY bp.token_address
     ORDER BY wallet_count DESC, bp.token_address ASC
     LIMIT $2`,
    [analysisId, tokenLimit]
  );
}

/** Candidats : wallets à couverture max (départage par matches sur top tokens). */
export async function getBestWalletCandidates(
  analysisId: string,
  tokenLimit: number,
  maxTieWallets: number
): Promise<BestWalletCandidateRow[]> {
  return query<BestWalletCandidateRow>(
    `WITH top_tokens AS (
       SELECT token_address FROM (
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
       SELECT bw.wallet_address, bw.coverage_percent, bw.active_days::int AS active_days,
              COUNT(DISTINCT CASE WHEN bp.token_address IN (SELECT token_address FROM top_tokens)
                   THEN bp.token_address END)::int AS candidate_token_matches
       FROM analysis_buyer_wallets bw
       LEFT JOIN analysis_buyer_purchases bp ON bp.buyer_wallet_id = bw.id
       WHERE bw.analysis_id = $1
       GROUP BY bw.wallet_address, bw.coverage_percent, bw.active_days
     ),
     max_cov AS (SELECT MAX(ws.coverage_percent) AS m FROM wallet_stats ws),
     tied AS (
       SELECT ws.wallet_address, ws.coverage_percent, ws.active_days, ws.candidate_token_matches,
              COUNT(*) OVER ()::int AS tied_at_max_count
       FROM wallet_stats ws CROSS JOIN max_cov mc
       WHERE ws.coverage_percent = mc.m
     ),
     ranked AS (
       SELECT t.*, ROW_NUMBER() OVER (ORDER BY t.candidate_token_matches DESC, t.wallet_address ASC)::int AS rn
       FROM tied t
     )
     SELECT wallet_address, coverage_percent, active_days, candidate_token_matches, tied_at_max_count
     FROM ranked WHERE rn <= $3`,
    [analysisId, tokenLimit, maxTieWallets]
  );
}

// ---------------------------------------------------------------------------
// analysis_mother_addresses
// ---------------------------------------------------------------------------

interface MotherRow {
  id: string;
  analysis_id: string;
  address: string;
  wallets_funded: number;
  validated: boolean;
  validated_at: string | null;
}

export function mapMother(r: MotherRow): AnalysisMotherAddress {
  return {
    id: r.id,
    analysisId: r.analysis_id,
    address: r.address,
    walletsFunded: r.wallets_funded,
    validated: r.validated,
    validatedAt: r.validated_at,
  };
}

export async function listMothers(analysisId: string): Promise<AnalysisMotherAddress[]> {
  const rows = await query<MotherRow>(
    `SELECT id, analysis_id, address, wallets_funded, validated, validated_at
     FROM analysis_mother_addresses
     WHERE analysis_id = $1
     ORDER BY wallets_funded DESC`,
    [analysisId]
  );
  return rows.map(mapMother);
}

export async function updateMotherValidation(
  motherId: string,
  analysisId: string,
  validated: boolean
): Promise<AnalysisMotherAddress | null> {
  const rows = await query<MotherRow>(
    `UPDATE analysis_mother_addresses
     SET validated = $2, validated_at = CASE WHEN $2 THEN NOW() ELSE NULL END
     WHERE id = $1 AND analysis_id = $3
     RETURNING id, analysis_id, address, wallets_funded, validated, validated_at`,
    [motherId, validated, analysisId]
  );
  return rows[0] ? mapMother(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Persistance du pipeline (écritures déplacées hors de run-analysis.ts)
// ---------------------------------------------------------------------------

export async function updateAnalysisStatus(
  analysisId: string,
  status: string,
  progress: number,
  progressLabel: string | null,
  errorMessage?: string
): Promise<void> {
  await query(
    `UPDATE wallet_analyses SET status = $2, progress = $3, progress_label = $4, error_message = $5 WHERE id = $1`,
    [analysisId, status, progress, progressLabel, errorMessage ?? null]
  );
}

export async function finalizeAnalysis(
  analysisId: string,
  tokenCount: number,
  buyerCount: number,
  partial: boolean
): Promise<void> {
  const label = partial ? 'Complete (partiel — budget temps atteint)' : 'Complete';
  await query(
    `UPDATE wallet_analyses
     SET status = 'completed', progress = 100, progress_label = $4,
         token_count = $2, buyer_count = $3, completed_at = NOW()
     WHERE id = $1`,
    [analysisId, tokenCount, buyerCount, label]
  );
}

export async function upsertAnalysisMotherAddress(
  analysisId: string,
  address: string,
  walletsFunded: number
): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `INSERT INTO analysis_mother_addresses (id, analysis_id, address, wallets_funded)
     VALUES (gen_random_uuid(), $1, $2, $3)
     ON CONFLICT (analysis_id, address) DO UPDATE SET wallets_funded = $3
     RETURNING id`,
    [analysisId, address, walletsFunded]
  );
  return rows[0]?.id ?? null;
}

export interface BuyerWalletPersistInput {
  analysisId: string;
  walletAddress: string;
  source: string;
  motherAddressId: string | null;
  tokensBought: number;
  totalTokens: number;
  coveragePercent: number;
  firstBuyAt: string | null;
  lastBuyAt: string | null;
  activeDays: number;
  spanDaysInScope: number;
  consistency: number;
  weight: number;
  avgHoldDurationHours: number | null;
  fundingDepth: number | null;
  fundingChain: string[] | null;
  motherChildCount: number;
  hasHighFanoutMother: boolean;
  matchingConfidence: number;
  inclusionDecision: string;
  riskFlag: string | null;
  riskLevel: string | null;
  decisionReasons: string[];
}

export async function upsertAnalysisBuyerWallet(input: BuyerWalletPersistInput): Promise<void> {
  await query(
    `INSERT INTO analysis_buyer_wallets
     (id, analysis_id, wallet_address, source, mother_address_id,
      tokens_bought, total_tokens, coverage_percent,
      first_buy_at, last_buy_at, active_days, span_days_in_scope, consistency, weight,
      avg_hold_duration_hours, funding_depth, funding_chain, mother_child_count, has_high_fanout_mother,
      matching_confidence, inclusion_decision, risk_flag, risk_level, decision_reasons)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     ON CONFLICT (analysis_id, wallet_address) DO UPDATE SET
       source = $3, mother_address_id = $4,
       tokens_bought = $5, total_tokens = $6, coverage_percent = $7,
       first_buy_at = $8, last_buy_at = $9, active_days = $10, span_days_in_scope = $11,
       consistency = $12, weight = $13,
       avg_hold_duration_hours = $14, funding_depth = $15, funding_chain = $16,
       mother_child_count = $17, has_high_fanout_mother = $18,
       matching_confidence = $19, inclusion_decision = $20, risk_flag = $21, risk_level = $22, decision_reasons = $23`,
    [
      input.analysisId,
      input.walletAddress,
      input.source,
      input.motherAddressId,
      input.tokensBought,
      input.totalTokens,
      input.coveragePercent,
      input.firstBuyAt,
      input.lastBuyAt,
      input.activeDays,
      input.spanDaysInScope,
      input.consistency,
      input.weight,
      input.avgHoldDurationHours,
      input.fundingDepth,
      input.fundingChain ? JSON.stringify(input.fundingChain) : null,
      input.motherChildCount,
      input.hasHighFanoutMother,
      input.matchingConfidence,
      input.inclusionDecision,
      input.riskFlag,
      input.riskLevel,
      JSON.stringify(input.decisionReasons),
    ]
  );
}

export async function insertAnalysisBuyerPurchase(args: {
  analysisId: string;
  walletAddress: string;
  tokenAddress: string;
  tokenName: string | null;
  purchasedAt: string | null;
  amountSol: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO analysis_buyer_purchases
     (id, buyer_wallet_id, token_address, token_name, purchased_at, amount_sol)
     SELECT gen_random_uuid(), bw.id, $2, $3, $4, $5
     FROM analysis_buyer_wallets bw
     WHERE bw.analysis_id = $1 AND bw.wallet_address = $6
     ON CONFLICT (buyer_wallet_id, token_address) DO NOTHING`,
    [args.analysisId, args.tokenAddress, args.tokenName, args.purchasedAt, args.amountSol, args.walletAddress]
  );
}

export async function loadWalletCentricCandidates(analysisId: string): Promise<string[]> {
  const rows = await query<{ wallet_address: string }>(
    `WITH target_rugger AS (SELECT rugger_id FROM wallet_analyses WHERE id = $1)
     SELECT DISTINCT wallet_address FROM (
       SELECT rbw.wallet_address FROM rugger_buyer_wallets rbw
       JOIN target_rugger tr ON tr.rugger_id = rbw.rugger_id
       UNION ALL
       SELECT bw.wallet_address FROM analysis_buyer_wallets bw
       JOIN wallet_analyses wa ON wa.id = bw.analysis_id
       JOIN target_rugger tr ON tr.rugger_id = wa.rugger_id
       UNION ALL
       SELECT ww.wallet_address FROM watchlist_wallets ww
       JOIN target_rugger tr ON tr.rugger_id = ww.source_rugger_id
     ) candidate_wallets`,
    [analysisId]
  );
  return rows.map((row) => row.wallet_address);
}

export async function loadHistoricalMaxCoverageByRugger(analysisId: string): Promise<Map<string, number>> {
  const rows = await query<{ wallet_address: string; max_coverage: string | number }>(
    `WITH target_rugger AS (SELECT rugger_id FROM wallet_analyses WHERE id = $1)
     SELECT bw.wallet_address, MAX(bw.coverage_percent) AS max_coverage
     FROM analysis_buyer_wallets bw
     JOIN wallet_analyses wa ON wa.id = bw.analysis_id
     JOIN target_rugger tr ON tr.rugger_id = wa.rugger_id
     GROUP BY bw.wallet_address`,
    [analysisId]
  );
  const out = new Map<string, number>();
  for (const row of rows) {
    const n = typeof row.max_coverage === 'number' ? row.max_coverage : Number(row.max_coverage);
    if (Number.isFinite(n)) out.set(row.wallet_address.toLowerCase(), n);
  }
  return out;
}
