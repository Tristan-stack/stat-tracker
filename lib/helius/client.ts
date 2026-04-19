import { throttleHelius } from '@/lib/helius/throttle';

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

function isRetryableHeliusFailure(status: number, message: string): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|timeout|aborted/i.test(message);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterHeader(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
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

/** `params` JSON-RPC : tableau (RPC classique) ou objet (ex. DAS `getAsset`). */
export async function heliusRpc<T>(method: string, params: unknown): Promise<T> {
  const url = buildRpcUrl();
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= HELIUS_MAX_RETRIES; attempt += 1) {
    try {
      await throttleHelius();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const message = `Helius RPC ${method}: HTTP ${res.status} — ${text.slice(0, 300)}`;
        if (attempt < HELIUS_MAX_RETRIES && isRetryableHeliusFailure(res.status, message)) {
          const retryAfterMs = parseRetryAfterHeader(res.headers.get('retry-after'));
          await sleep(getBackoffMs(attempt, res.status, retryAfterMs));
          continue;
        }
        throw new Error(message);
      }

      const json = (await res.json()) as RpcResponse<T>;
      if (json.error) {
        throw new Error(`Helius RPC ${method}: ${json.error.message} (code ${json.error.code})`);
      }
      return json.result;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < HELIUS_MAX_RETRIES && isRetryableHeliusFailure(0, message)) {
        await sleep(HELIUS_RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// REST helper (Enhanced Transactions API)
// ---------------------------------------------------------------------------

export async function heliusRest<T>(path: string, body: unknown): Promise<T> {
  const url = buildRestUrl(path);
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
        const message = `Helius REST ${path}: HTTP ${res.status} — ${text.slice(0, 300)}`;
        if (attempt < HELIUS_MAX_RETRIES && isRetryableHeliusFailure(res.status, message)) {
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
      if (attempt < HELIUS_MAX_RETRIES && isRetryableHeliusFailure(0, message)) {
        await sleep(HELIUS_RETRY_BASE_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }

  throw lastError;
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
