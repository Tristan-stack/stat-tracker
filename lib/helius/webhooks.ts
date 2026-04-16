import { query } from '@/lib/db';

const HELIUS_BASE = 'https://api.helius.xyz';
const DEFAULT_TRANSACTION_TYPES = ['SWAP'] as const;
const WEBHOOK_PATH = '/api/webhooks/helius';

function getApiKey(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY is not configured');
  return key;
}

function getWebhookUrl(): string {
  const appUrl = process.env.APP_URL?.replace(/\/$/, '');
  if (!appUrl) throw new Error('APP_URL is not configured (needed to build the Helius webhook URL)');
  return `${appUrl}${WEBHOOK_PATH}`;
}

function getAuthHeaderSecret(): string {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) throw new Error('HELIUS_WEBHOOK_SECRET is not configured');
  return secret;
}

interface HeliusWebhook {
  webhookID: string;
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: string;
  authHeader?: string;
}

interface WebhookPayload {
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: 'enhanced';
  authHeader: string;
}

async function heliusFetch<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${HELIUS_BASE}${path}?api-key=${getApiKey()}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Helius webhooks ${method} ${path}: HTTP ${res.status} — ${text.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

async function loadStoredWebhookId(): Promise<string | null> {
  const rows = await query<{ webhook_id: string }>(
    'SELECT webhook_id FROM helius_webhook_sync ORDER BY last_synced_at DESC LIMIT 1',
    []
  );
  return rows[0]?.webhook_id ?? null;
}

async function upsertStoredWebhook(webhookId: string, addressCount: number): Promise<void> {
  await query(
    `INSERT INTO helius_webhook_sync (id, webhook_id, last_synced_at, address_count)
     VALUES (gen_random_uuid(), $1, NOW(), $2)
     ON CONFLICT (webhook_id) DO UPDATE
       SET last_synced_at = NOW(), address_count = EXCLUDED.address_count`,
    [webhookId, addressCount]
  );
}

async function clearStoredWebhook(webhookId: string): Promise<void> {
  await query('DELETE FROM helius_webhook_sync WHERE webhook_id = $1', [webhookId]);
}

async function fetchAllWatchlistAddresses(): Promise<string[]> {
  const rows = await query<{ wallet_address: string }>(
    'SELECT DISTINCT wallet_address FROM watchlist_wallets',
    []
  );
  return rows.map((r) => r.wallet_address).filter(Boolean);
}

async function createWebhook(addresses: string[]): Promise<string> {
  const payload: WebhookPayload = {
    webhookURL: getWebhookUrl(),
    transactionTypes: [...DEFAULT_TRANSACTION_TYPES],
    accountAddresses: addresses,
    webhookType: 'enhanced',
    authHeader: getAuthHeaderSecret(),
  };
  const created = await heliusFetch<HeliusWebhook>('POST', '/v0/webhooks', payload);
  return created.webhookID;
}

async function updateWebhook(webhookId: string, addresses: string[]): Promise<void> {
  const payload: WebhookPayload = {
    webhookURL: getWebhookUrl(),
    transactionTypes: [...DEFAULT_TRANSACTION_TYPES],
    accountAddresses: addresses,
    webhookType: 'enhanced',
    authHeader: getAuthHeaderSecret(),
  };
  await heliusFetch<HeliusWebhook>('PUT', `/v0/webhooks/${webhookId}`, payload);
}

async function deleteWebhook(webhookId: string): Promise<void> {
  await heliusFetch<unknown>('DELETE', `/v0/webhooks/${webhookId}`);
}

export interface SyncWatchlistResult {
  webhookId: string | null;
  addressCount: number;
  action: 'created' | 'updated' | 'deleted' | 'noop';
}

/**
 * Synchronize all watchlist wallet addresses (every user) with a single Helius
 * enhanced webhook. Creates the webhook the first time, updates it on subsequent
 * calls, and deletes it if the watchlist becomes empty.
 */
export async function syncWatchlistToHelius(): Promise<SyncWatchlistResult> {
  const addresses = await fetchAllWatchlistAddresses();
  const existingId = await loadStoredWebhookId();

  if (addresses.length === 0) {
    if (existingId) {
      try {
        await deleteWebhook(existingId);
      } catch (err) {
        console.warn('syncWatchlistToHelius: delete failed, clearing local ref', err);
      }
      await clearStoredWebhook(existingId);
      return { webhookId: null, addressCount: 0, action: 'deleted' };
    }
    return { webhookId: null, addressCount: 0, action: 'noop' };
  }

  if (existingId) {
    try {
      await updateWebhook(existingId, addresses);
      await upsertStoredWebhook(existingId, addresses.length);
      return { webhookId: existingId, addressCount: addresses.length, action: 'updated' };
    } catch (err) {
      console.warn('syncWatchlistToHelius: update failed, recreating webhook', err);
      await clearStoredWebhook(existingId);
    }
  }

  const newId = await createWebhook(addresses);
  await upsertStoredWebhook(newId, addresses.length);
  return { webhookId: newId, addressCount: addresses.length, action: 'created' };
}

/** Fire-and-forget wrapper used from CRUD endpoints; swallows errors and logs them. */
export function syncWatchlistToHeliusAsync(): void {
  void syncWatchlistToHelius().catch((err) => {
    console.error('syncWatchlistToHelius (async) failed', err);
  });
}
