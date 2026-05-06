import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';
import { parsePnlMessage } from '@/lib/telegram/parser';
import type { TelegramClient } from 'telegram';
import {
  createConnectedTelegramClientForUser,
  iterateChannelMessagesInRange,
  telegramScrapeMaxMessages,
  TelegramAuthError,
  TelegramConfigError,
} from '@/lib/telegram/client';

export type TelegramScrapeStatsSnapshot = {
  fetched: number;
  persisted: number;
  parsedRegex: number;
  parsedGemini: number;
  failed: number;
  maxMessagesConfigured: number;
};

export type TelegramScrapeOutcome = TelegramScrapeStatsSnapshot & {
  telegramIterationStoppedByLimit: boolean;
  warning?: string;
};

export async function runTelegramPnlScrape(opts: {
  userId: string;
  channelId: string;
  telegramUsername: string;
  fromMs: number;
  toMs: number;
  onAfterMessage?: (stats: TelegramScrapeStatsSnapshot) => void | Promise<void>;
}): Promise<TelegramScrapeOutcome> {
  const { userId, channelId, telegramUsername, fromMs, toMs, onAfterMessage } = opts;
  const maxMsgs = telegramScrapeMaxMessages();
  const telegramLimitRef: [boolean] = [false];
  let fetched = 0;
  let parsedRegex = 0;
  let parsedGemini = 0;
  let failed = 0;
  let persisted = 0;

  let client: TelegramClient | undefined;
  try {
    client = await createConnectedTelegramClientForUser(userId);
    for await (const item of iterateChannelMessagesInRange(client, telegramUsername, fromMs, toMs, {
      maxMessages: maxMsgs,
      telegramIterationStoppedByLimit: telegramLimitRef,
    })) {
      fetched += 1;
      const parsed = await parsePnlMessage(telegramUsername, item.messageId, item.text);

      if (parsed.source === 'regex') parsedRegex += 1;
      else if (parsed.source === 'gemini') parsedGemini += 1;
      else failed += 1;

      const parseError = parsed.source === 'failed' ? (parsed.error ?? 'parse_failed') : null;

      await query(
        `insert into telegram_pnl_messages (
          id, channel_id, message_id, posted_at, raw_text, parser_used,
          token_mint, token_name, invested_sol, sold_sol, profit_sol, profit_pct, parse_error
        ) values (
          $1, $2, $3::bigint, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13
        )
        on conflict (channel_id, message_id) do update set
          posted_at = EXCLUDED.posted_at,
          raw_text = EXCLUDED.raw_text,
          parser_used = EXCLUDED.parser_used,
          token_mint = EXCLUDED.token_mint,
          token_name = EXCLUDED.token_name,
          invested_sol = EXCLUDED.invested_sol,
          sold_sol = EXCLUDED.sold_sol,
          profit_sol = EXCLUDED.profit_sol,
          profit_pct = EXCLUDED.profit_pct,
          parse_error = EXCLUDED.parse_error,
          parsed_at = now()`,
        [
          randomUUID(),
          channelId,
          String(item.messageId),
          item.postedAt.toISOString(),
          item.text,
          parsed.source,
          parsed.tokenMint,
          parsed.tokenName,
          parsed.investedSol,
          parsed.soldSol,
          parsed.profitSol,
          parsed.profitPct,
          parseError,
        ]
      );
      persisted += 1;

      await onAfterMessage?.({
        fetched,
        persisted,
        parsedRegex,
        parsedGemini,
        failed,
        maxMessagesConfigured: maxMsgs,
      });
    }
  } finally {
    try {
      await client?.disconnect();
    } catch {
      // ignore
    }
  }

  const hitTelegramIterationLimit = telegramLimitRef[0];
  const warning = hitTelegramIterationLimit
    ? 'Limite Telegram (TELEGRAM_SCRAPE_MAX_MESSAGES) atteinte avant le début de la plage : élargir la variable, ou découper en plusieurs scrapes.'
    : undefined;

  return {
    fetched,
    persisted,
    parsedRegex,
    parsedGemini,
    failed,
    maxMessagesConfigured: maxMsgs,
    telegramIterationStoppedByLimit: hitTelegramIterationLimit,
    ...(warning ? { warning } : {}),
  };
}

export function isTelegramScrapeConfigError(err: unknown): err is TelegramConfigError {
  return err instanceof TelegramConfigError;
}

export function isTelegramScrapeAuthError(err: unknown): err is TelegramAuthError {
  return err instanceof TelegramAuthError;
}
