import { countTokenCreationsFromEnhancedTxs } from '@/lib/helius/token-creator-detect';
import { throttleHelius } from '@/lib/helius/throttle';
import { sleep, parseRetryAfterHeader, isRetryableFailure } from '@/lib/http/retry';

const HELIUS_BASE = 'https://api.helius.xyz';
const HELIUS_MAX_RETRIES = Number(process.env.HELIUS_MAX_RETRIES ?? '3');
const HELIUS_RETRY_BASE_MS = Number(process.env.HELIUS_RETRY_BASE_MS ?? '300');
const HELIUS_RATE_LIMIT_MIN_WAIT_MS = Number(process.env.HELIUS_RATE_LIMIT_MIN_WAIT_MS ?? '2000');
const HELIUS_RATE_LIMIT_MAX_WAIT_MS = Number(process.env.HELIUS_RATE_LIMIT_MAX_WAIT_MS ?? '10000');

function getApiKey(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY is not configured');
  return key;
}

function buildRpcUrl(): string {
  return `https://mainnet.helius-rpc.com/?api-key=${getApiKey()}`;
}

function buildRestUrl(path: string): string {
  return `${HELIUS_BASE}${path}?api-key=${getApiKey()}`;
}

// ---------------------------------------------------------------------------
// Helius Enhanced Transaction types (subset we use)
// ---------------------------------------------------------------------------

export interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
}

export interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
  mint: string;
  tokenStandard: string;
}

export interface HeliusSwapEvent {
  nativeInput: { account: string; amount: string } | null;
  nativeOutput: { account: string; amount: string } | null;
  tokenInputs: { userAccount: string; tokenAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
  tokenOutputs: { userAccount: string; tokenAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
}

export interface HeliusEnhancedTransaction {
  description: string;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  nativeTransfers: HeliusNativeTransfer[];
  tokenTransfers: HeliusTokenTransfer[];
  events: {
    swap?: HeliusSwapEvent;
  };
}

// ---------------------------------------------------------------------------
// RPC types
// ---------------------------------------------------------------------------

export interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
}

// ---------------------------------------------------------------------------
// JSON-RPC helper
// ---------------------------------------------------------------------------

interface RpcResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
  error?: { code: number; message: string };
}

function getBackoffMs(attempt: number, status: number, retryAfterMs?: number | null): number {
  if (retryAfterMs != null && retryAfterMs > 0) return retryAfterMs;
  if (status === 429) {
    const jitter = Math.floor(Math.random() * 400);
    const delay = HELIUS_RATE_LIMIT_MIN_WAIT_MS * Math.pow(2, attempt) + jitter;
    return Math.min(delay, HELIUS_RATE_LIMIT_MAX_WAIT_MS);
  }
  return HELIUS_RETRY_BASE_MS * Math.pow(2, attempt);
}

/**
 * POST JSON vers Helius avec throttle + retry/backoff (429/5xx/réseau).
 * Boucle unique mutualisée entre les helpers RPC et REST.
 */
async function heliusPost<T>(url: string, body: unknown, label: string): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= HELIUS_MAX_RETRIES; attempt += 1) {
    try {
      await throttleHelius();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const message = `${label}: HTTP ${res.status} — ${text.slice(0, 300)}`;
        if (attempt < HELIUS_MAX_RETRIES && isRetryableFailure(res.status, message)) {
          const retryAfterMs = parseRetryAfterHeader(res.headers.get('retry-after'));
          await sleep(getBackoffMs(attempt, res.status, retryAfterMs));
          continue;
        }
        throw new Error(message);
      }

      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < HELIUS_MAX_RETRIES && isRetryableFailure(0, message)) {
        await sleep(HELIUS_RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

/** `params` JSON-RPC : tableau (RPC classique) ou objet (ex. DAS `getAsset`). */
export async function heliusRpc<T>(method: string, params: unknown): Promise<T> {
  const json = await heliusPost<RpcResponse<T>>(
    buildRpcUrl(),
    { jsonrpc: '2.0', id: 1, method, params },
    `Helius RPC ${method}`
  );
  if (json.error) {
    throw new Error(`Helius RPC ${method}: ${json.error.message} (code ${json.error.code})`);
  }
  return json.result;
}

// ---------------------------------------------------------------------------
// REST helper (Enhanced Transactions API)
// ---------------------------------------------------------------------------

export async function heliusRest<T>(path: string, body: unknown): Promise<T> {
  return heliusPost<T>(buildRestUrl(path), body, `Helius REST ${path}`);
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export interface GetSignaturesOpts {
  limit?: number;
  before?: string;
  until?: string;
  minContextSlot?: number;
}

export async function getSignaturesForAddress(
  address: string,
  opts?: GetSignaturesOpts
): Promise<SignatureInfo[]> {
  const config: Record<string, unknown> = { limit: opts?.limit ?? 1000 };
  if (opts?.before) config.before = opts.before;
  if (opts?.until) config.until = opts.until;
  if (opts?.minContextSlot) config.minContextSlot = opts.minContextSlot;
  return heliusRpc<SignatureInfo[]>('getSignaturesForAddress', [address, config]);
}

export async function parseTransactions(
  signatures: string[]
): Promise<HeliusEnhancedTransaction[]> {
  if (signatures.length === 0) return [];
  const configuredBatchSize = Number(process.env.HELIUS_PARSE_BATCH_SIZE ?? '50');
  const batchSize = Math.max(10, Math.min(configuredBatchSize, 100));
  const results: HeliusEnhancedTransaction[] = [];
  for (let i = 0; i < signatures.length; i += batchSize) {
    const batch = signatures.slice(i, i + batchSize);
    const parsed = await heliusRest<HeliusEnhancedTransaction[]>(
      '/v0/transactions',
      { transactions: batch }
    );
    results.push(...parsed);
  }
  return results;
}

export async function getEnhancedTransactionsByAddress(
  address: string,
  opts?: { before?: string; type?: string }
): Promise<HeliusEnhancedTransaction[]> {
  await throttleHelius();
  const params = new URLSearchParams({ 'api-key': getApiKey() });
  if (opts?.before) params.set('before', opts.before);
  if (opts?.type) params.set('type', opts.type);
  const url = `${HELIUS_BASE}/v0/addresses/${address}/transactions?${params.toString()}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Helius addresses/${address}/transactions: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

  return (await res.json()) as HeliusEnhancedTransaction[];
}

export const DUST_SOL_THRESHOLD = 0.01;
export const LAMPORTS_PER_SOL = 1_000_000_000;

// ---------------------------------------------------------------------------
// Raw transaction (RPC getTransaction) — utilisé par le tracer 7Srsw pour
// lire les input accounts d'une instruction non parsée.
// ---------------------------------------------------------------------------

/**
 * En `jsonParsed`, les instructions de programmes connus exposent un champ
 * `parsed` (type + info). Les programmes custom (non parsés, ex. 7Srsw)
 * exposent seulement `programId`, `accounts: string[]` et `data`.
 * `accounts` contient les clés publiques déjà résolues, lookup tables comprises.
 */
export interface RawInstruction {
  programId: string;
  accounts: string[];
  data?: string;
  parsed?: unknown;
}

export interface RawInnerInstructions {
  index: number;
  instructions: RawInstruction[];
}

export interface RawTransactionMeta {
  err: unknown;
  fee?: number;
  preBalances?: number[];
  postBalances?: number[];
  innerInstructions?: RawInnerInstructions[];
}

export interface RawTransactionMessage {
  instructions: RawInstruction[];
  accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean; source?: string } | string>;
}

export interface RawTransaction {
  transaction: {
    message: RawTransactionMessage;
    signatures: string[];
  };
  meta: RawTransactionMeta | null;
  blockTime: number | null;
  slot: number;
}

export async function getRawTransaction(signature: string): Promise<RawTransaction> {
  return heliusRpc<RawTransaction>('getTransaction', [
    signature,
    { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
  ]);
}

// ---------------------------------------------------------------------------
// DAS — détection des créateurs de tokens
// ---------------------------------------------------------------------------

interface DasSearchAssetsResult {
  total?: number;
  limit?: number;
  page?: number;
  items?: Array<{ id: string }>;
}

function dasTotal(result: DasSearchAssetsResult | null | undefined): number {
  if (typeof result?.total === 'number' && Number.isFinite(result.total) && result.total > 0) {
    return result.total;
  }
  return Array.isArray(result?.items) ? result.items.length : 0;
}

/**
 * Compte les assets dont `address` est créditée comme créateur on-chain.
 *
 * Helius DAS expose deux filtres complémentaires :
 *  - `creatorAddress` : adresses présentes dans le tableau `creators` du
 *    metadata Metaplex (typique des launchpads pumpfun / letsbonk).
 *  - `authorityAddress` : update authority (cas des tokens créés via raw
 *    `initializeMint` sans Metaplex ou avec metadata renoncée).
 *
 * On interroge les deux en parallèle et on renvoie le max (les ensembles
 * peuvent se chevaucher). `tokenType: 'all'` est obligatoire pour searchAssets.
 *
 * Si DAS renvoie 0, repli sur l'historique enrichi Helius (TOKEN_MINT / CREATE)
 * — cas typique pump.fun où le wallet n'est pas indexé comme Metaplex creator.
 */
export async function getCreatedAssetsCount(address: string): Promise<number> {
  const dasCount = await getDasCreatedAssetsCount(address);
  if (dasCount > 0) return dasCount;
  return getEnhancedTokenCreationCount(address);
}

async function getDasCreatedAssetsCount(address: string): Promise<number> {
  const [creatorRes, authorityRes] = await Promise.all([
    heliusRpc<DasSearchAssetsResult>('searchAssets', {
      creatorAddress: address,
      tokenType: 'all',
      page: 1,
      limit: 1,
    }).catch(() => null),
    heliusRpc<DasSearchAssetsResult>('searchAssets', {
      authorityAddress: address,
      tokenType: 'all',
      page: 1,
      limit: 1,
    }).catch(() => null),
  ]);

  return Math.max(dasTotal(creatorRes), dasTotal(authorityRes));
}

async function getEnhancedTokenCreationCount(address: string): Promise<number> {
  try {
    const [mintTxs, createTxs] = await Promise.all([
      getEnhancedTransactionsByAddress(address, { type: 'TOKEN_MINT' }),
      getEnhancedTransactionsByAddress(address, { type: 'CREATE' }),
    ]);
    return countTokenCreationsFromEnhancedTxs([...mintTxs, ...createTxs], address);
  } catch {
    return 0;
  }
}
