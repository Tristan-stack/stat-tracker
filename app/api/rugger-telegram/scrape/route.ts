import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';
import {
  isTelegramScrapeAuthError,
  isTelegramScrapeConfigError,
  runTelegramPnlScrape,
} from '@/lib/rugger-telegram/scrape-runner';
import { telegramScrapeMaxMessages } from '@/lib/telegram/client';

export const runtime = 'nodejs';
/** Vercel Hobby plafonne à 60s. Pour de gros canaux, scraper par morceaux (plages plus courtes). */
export const maxDuration = 60;

type ScrapeBody = {
  channelId?: string;
  from?: string;
  to?: string;
  /** Si true, réponse `application/x-ndjson` avec événements `start` / `tick` / `done` / `error`. */
  stream?: boolean;
};

const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-store',
} as const;

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  let body: ScrapeBody;
  try {
    body = (await req.json()) as ScrapeBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const channelId = body.channelId?.trim() ?? '';
  const fromIso = body.from?.trim() ?? '';
  const toIso = body.to?.trim() ?? '';
  if (!channelId || !fromIso || !toIso) {
    return NextResponse.json({ error: 'channelId_from_et_to_obligatoires' }, { status: 400 });
  }

  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    return NextResponse.json({ error: 'plage_dates_invalide' }, { status: 400 });
  }

  const channelRows = await query<{ username: string }>(
    `select username from telegram_channels where id = $1 and user_id = $2`,
    [channelId, userId]
  );
  const channel = channelRows[0];
  if (!channel) return NextResponse.json({ error: 'channel_introuvable' }, { status: 404 });

  const useStream = body.stream === true;

  if (useStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const push = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };

        void (async () => {
          let lastTickAt = 0;
          try {
            push({
              type: 'start',
              maxMessages: telegramScrapeMaxMessages(),
            });

            const result = await runTelegramPnlScrape({
              userId,
              channelId,
              telegramUsername: channel.username,
              fromMs,
              toMs,
              onAfterMessage: async (stats) => {
                const now = Date.now();
                const emit =
                  stats.fetched <= 4 ||
                  stats.fetched % 10 === 0 ||
                  now - lastTickAt >= 120;
                if (!emit) return;
                lastTickAt = now;
                push({
                  type: 'tick',
                  fetched: stats.fetched,
                  persisted: stats.persisted,
                  parsedRegex: stats.parsedRegex,
                  parsedGemini: stats.parsedGemini,
                  failed: stats.failed,
                  maxMessagesConfigured: stats.maxMessagesConfigured,
                });
              },
            });

            push({
              type: 'tick',
              fetched: result.fetched,
              persisted: result.persisted,
              parsedRegex: result.parsedRegex,
              parsedGemini: result.parsedGemini,
              failed: result.failed,
              maxMessagesConfigured: result.maxMessagesConfigured,
            });

            push({
              type: 'done',
              ok: true,
              fetched: result.fetched,
              parsedRegex: result.parsedRegex,
              parsedGemini: result.parsedGemini,
              failed: result.failed,
              persisted: result.persisted,
              maxMessagesConfigured: result.maxMessagesConfigured,
              telegramIterationStoppedByLimit: result.telegramIterationStoppedByLimit,
              ...(result.warning ? { warning: result.warning } : {}),
            });
          } catch (err) {
            if (isTelegramScrapeConfigError(err)) {
              push({ type: 'error', error: err.message, code: err.code, httpStatus: 400 });
            } else if (isTelegramScrapeAuthError(err)) {
              push({ type: 'error', error: err.message, code: err.code, httpStatus: 401 });
            } else {
              const message = err instanceof Error ? err.message : String(err);
              console.error('[rugger-telegram/scrape stream]', message);
              push({ type: 'error', error: 'telegram_scrape_failed', detail: message, httpStatus: 502 });
            }
          } finally {
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, { headers: NDJSON_HEADERS });
  }

  try {
    const result = await runTelegramPnlScrape({
      userId,
      channelId,
      telegramUsername: channel.username,
      fromMs,
      toMs,
    });

    return NextResponse.json({
      ok: true,
      fetched: result.fetched,
      parsedRegex: result.parsedRegex,
      parsedGemini: result.parsedGemini,
      failed: result.failed,
      persisted: result.persisted,
      maxMessagesConfigured: result.maxMessagesConfigured,
      telegramIterationStoppedByLimit: result.telegramIterationStoppedByLimit,
      ...(result.warning ? { warning: result.warning } : {}),
    });
  } catch (err) {
    if (isTelegramScrapeConfigError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (isTelegramScrapeAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rugger-telegram/scrape]', message);
    return NextResponse.json({ error: 'telegram_scrape_failed', detail: message }, { status: 502 });
  }
}
