import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { badRequest, notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { getChannelUsername } from '@/features/telegram/repository';
import {
  isTelegramScrapeAuthError,
  isTelegramScrapeConfigError,
  runTelegramPnlScrape,
} from '@/lib/rugger-telegram/scrape-runner';
import { telegramScrapeMaxMessages } from '@/lib/telegram/client';

export const runtime = 'nodejs';
/** Vercel Hobby plafonne à 60s. Pour de gros canaux, scraper par morceaux (plages plus courtes). */
export const maxDuration = 60;

const NDJSON_HEADERS = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-store',
} as const;

const scrapeSchema = z.object({
  channelId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  stream: z.boolean().optional(),
});

export const POST = withAuth(async (req, _ctx, { userId }) => {
  const body = await parseBody(req, scrapeSchema);
  const channelId = body.channelId?.trim() ?? '';
  const fromIso = body.from?.trim() ?? '';
  const toIso = body.to?.trim() ?? '';
  if (!channelId || !fromIso || !toIso) throw badRequest('channelId_from_et_to_obligatoires');

  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    throw badRequest('plage_dates_invalide');
  }

  const username = await getChannelUsername(channelId, userId);
  if (!username) throw notFoundError('channel_introuvable');

  if (body.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const push = (obj: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        };

        void (async () => {
          let lastTickAt = 0;
          try {
            push({ type: 'start', maxMessages: telegramScrapeMaxMessages() });

            const result = await runTelegramPnlScrape({
              userId,
              channelId,
              telegramUsername: username,
              fromMs,
              toMs,
              onAfterMessage: async (stats) => {
                const now = Date.now();
                const emit = stats.fetched <= 4 || stats.fetched % 10 === 0 || now - lastTickAt >= 120;
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
    const result = await runTelegramPnlScrape({ userId, channelId, telegramUsername: username, fromMs, toMs });
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
});
