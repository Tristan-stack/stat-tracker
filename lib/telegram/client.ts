import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';
import {
  decryptTelegramSessionString,
  TelegramSessionDecryptError,
} from '@/lib/crypto/telegram-session-crypto';
import { query } from '@/lib/db';

/** Cap par défaut relevé pour les plages multi-jours (surcharge : TELEGRAM_SCRAPE_MAX_MESSAGES). */
export function telegramScrapeMaxMessages(): number {
  const raw = process.env.TELEGRAM_SCRAPE_MAX_MESSAGES?.trim();
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : NaN;
  const fallback = 25_000;
  const n = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  return Math.min(100_000, Math.max(500, n));
}

export class TelegramAuthError extends Error {
  readonly code = 'telegram_auth_error' as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TelegramAuthError';
  }
}

export class TelegramConfigError extends Error {
  readonly code = 'telegram_config_error' as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TelegramConfigError';
  }
}

/** Credentials d’application (my.telegram.org). Requis pour le scrape et pour lier une session utilisateur. */
export function requireTelegramAppCredentials(): { apiId: number; apiHash: string } {
  const rawId = process.env.TELEGRAM_API_ID?.trim() ?? '';
  const apiId = Number(rawId.replace(/\s+/g, ''));
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? '';
  if (!Number.isFinite(apiId) || apiId <= 0) throw new TelegramConfigError('TELEGRAM_API_ID manquant ou invalide');
  if (!apiHash) throw new TelegramConfigError('TELEGRAM_API_HASH manquant');
  return { apiId, apiHash };
}

function requireTelegramGlobalSessionCredentials(): {
  apiId: number;
  apiHash: string;
  sessionStr: string;
} {
  const { apiId, apiHash } = requireTelegramAppCredentials();
  const sessionStr = process.env.TELEGRAM_SESSION_STRING?.trim() ?? '';
  if (!sessionStr) throw new TelegramConfigError('TELEGRAM_SESSION_STRING manquant (CLI : scripts/telegram-login.mjs)');
  return { apiId, apiHash, sessionStr };
}

const defaultClientOptions = () =>
  ({
    connectionRetries: 5,
    requestRetries: 2,
    deviceModel: 'StatTracker',
    appVersion: '1.0',
  }) as const;

/**
 * @deprecated Ancienne session globale (.env). Préférer `createConnectedTelegramClientForUser`.
 */
export async function createConnectedTelegramClient(): Promise<TelegramClient> {
  const { apiId, apiHash, sessionStr } = requireTelegramGlobalSessionCredentials();
  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, apiId, apiHash, { ...defaultClientOptions() });
  await client.connect();
  const ok = await client.checkAuthorization();
  if (!ok) {
    await client.disconnect();
    throw new TelegramAuthError(
      'Session Telegram invalide ou expirée (TELEGRAM_SESSION_STRING). Utilise scripts/telegram-login.mjs pour régénérer.'
    );
  }
  return client;
}

/**
 * Connexion Telegram avec session GramJS persistée pour l’utilisateur (voir flux mtproto/).
 */
export async function createConnectedTelegramClientForUser(userId: string): Promise<TelegramClient> {
  const rows = await query<{ encrypted_payload: string }>(
    `select encrypted_payload from telegram_mtproto_sessions where user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) {
    throw new TelegramAuthError('Lie ton compte Telegram (numéro + code) depuis la page Leaderboard Telegram.');
  }
  let sessionStr: string;
  try {
    sessionStr = decryptTelegramSessionString(row.encrypted_payload);
  } catch (err) {
    if (err instanceof TelegramSessionDecryptError) {
      throw new TelegramAuthError('Session Telegram utilisateur illisible. Déconnecte et reconnecte depuis la page.');
    }
    throw err;
  }
  const { apiId, apiHash } = requireTelegramAppCredentials();
  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, apiId, apiHash, { ...defaultClientOptions() });
  await client.connect();
  const ok = await client.checkAuthorization();
  if (!ok) {
    await client.disconnect();
    throw new TelegramAuthError(
      'Session Telegram expirée ou révoquée. Déconnecte et reconnecte avec un nouveau code.'
    );
  }
  return client;
}

export type IteratedChannelMessage = {
  messageId: bigint;
  postedAt: Date;
  text: string;
};

/**
 * Parcourt l’historique du plus récent au plus ancien ; s’arrête quand `message.date` &lt; `fromSec`.
 * `offsetDate` est exclusif côté API : on utilise le second après `toSec` pour inclure les posts à `toSec`.
 */
export type IterateChannelMessagesOptions = {
  maxMessages?: number;
  /** Tableau singleton [boolean] mis à true si Telegram a encore des messages dans la plage mais qu’on a stoppé sur `maxMessages`. */
  telegramIterationStoppedByLimit?: [boolean];
};

export async function* iterateChannelMessagesInRange(
  client: TelegramClient,
  channelUsername: string,
  fromMs: number,
  toMs: number,
  options?: IterateChannelMessagesOptions
): AsyncGenerator<IteratedChannelMessage> {
  const fromSec = Math.floor(fromMs / 1000);
  const toSec = Math.floor(toMs / 1000);
  const maxMessages = options?.maxMessages ?? telegramScrapeMaxMessages();
  /** Telegram `DateLike` = epoch second (voir `telegram/define.d.ts`). */
  const offsetDateSec = toSec + 1;
  let seen = 0;
  for await (const message of client.iterMessages(channelUsername, {
    offsetDate: offsetDateSec,
    offsetId: 0,
    minId: 0,
    maxId: 0,
  })) {
    seen += 1;
    if (seen > maxMessages) {
      if (options?.telegramIterationStoppedByLimit) options.telegramIterationStoppedByLimit[0] = true;
      break;
    }
    const dateSec = typeof message.date === 'number' ? message.date : 0;
    if (dateSec < fromSec) break;
    if (dateSec > toSec) continue;
    const text = typeof message.message === 'string' ? message.message : '';
    if (!text.trim()) continue;
    const id = typeof message.id === 'number' || typeof message.id === 'bigint' ? Number(message.id) : null;
    if (id === null || !Number.isFinite(id)) continue;
    yield {
      messageId: BigInt(id),
      postedAt: new Date(dateSec * 1000),
      text,
    };
  }
}
