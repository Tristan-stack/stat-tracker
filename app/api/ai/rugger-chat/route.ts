import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { generateRuggerAiResponse } from '@/lib/ai/gemini';
import { loadRuggerAiContext, type RuggerAiContext } from '@/lib/ai/rugger-context';
import { buildFallbackStrategy } from '@/lib/ai/rugger-strategy';
import { query } from '@/lib/db';
import type { RuggerAiChatRequest, RuggerAiChatResponse } from '@/types/ai';

const CACHE_TTL_MS = 60 * 1000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1200;
const contextCache = new Map<string, { at: number; value: RuggerAiContext }>();

interface RandomEntryPriceAction {
  kind: 'random_entry_price_between';
  min: number;
  max: number;
}

function parseLocaleNumber(raw: string): number {
  return Number(raw.replace(',', '.').trim());
}

function parseRandomEntryPriceAction(content: string): RandomEntryPriceAction | null {
  const normalized = content
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const mentionsEntryPrice =
    normalized.includes("point d'entree") ||
    normalized.includes("points d'entree") ||
    normalized.includes('point entree') ||
    normalized.includes('points entree');
  const mentionsRandom =
    normalized.includes('aleatoire') || normalized.includes('random');
  if (!mentionsEntryPrice || !mentionsRandom) return null;

  const betweenMatch = normalized.match(
    /entre\s*(-?\d+(?:[.,]\d+)?)\s*(?:et|a|à|-)\s*(-?\d+(?:[.,]\d+)?)/i
  );
  if (!betweenMatch) return null;

  const rawA = betweenMatch[1];
  const rawB = betweenMatch[2];
  const a = parseLocaleNumber(rawA);
  const b = parseLocaleNumber(rawB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  const min = Math.min(a, b);
  const max = Math.max(a, b);
  if (min <= 0 || max <= 0) return null;
  if (max - min < 1e-12) return null;

  return { kind: 'random_entry_price_between', min, max };
}

async function applyRandomEntryPriceAction(
  ruggerId: string,
  action: RandomEntryPriceAction
): Promise<number> {
  const rows = await query<{ count: string }>(
    `
      with updated as (
        update rugger_tokens
        set entry_price = $1 + random() * ($2 - $1)
        where rugger_id = $3
        returning id
      )
      select count(*)::text as count from updated
    `,
    [action.min, action.max, ruggerId]
  );
  return Number(rows[0]?.count ?? '0');
}

async function getCachedContext(ruggerId: string): Promise<RuggerAiContext> {
  const cached = contextCache.get(ruggerId);
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;
  const fresh = await loadRuggerAiContext(ruggerId);
  contextCache.set(ruggerId, { at: now, value: fresh });
  return fresh;
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const body = (await req.json()) as RuggerAiChatRequest;
  const ruggerId = typeof body.ruggerId === 'string' ? body.ruggerId : '';
  if (ruggerId.trim() === '') {
    return NextResponse.json({ error: 'ruggerId is required' }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: 'messages are required' }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: `Too many messages (max ${MAX_MESSAGES})` }, { status: 400 });
  }
  const normalizedMessages = messages.map((item) => ({
    role: item.role,
    content: typeof item.content === 'string' ? item.content.trim().slice(0, MAX_MESSAGE_CHARS) : '',
  }));
  if (normalizedMessages.some((item) => item.role !== 'user' && item.role !== 'assistant')) {
    return NextResponse.json({ error: 'Invalid message role' }, { status: 400 });
  }
  if (normalizedMessages.every((item) => item.content === '')) {
    return NextResponse.json({ error: 'messages are empty' }, { status: 400 });
  }

  const hasAccess = await ruggerExistsForUser(ruggerId, userId);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  try {
    const lastUserMessage = [...normalizedMessages]
      .reverse()
      .find((item) => item.role === 'user');
    if (lastUserMessage) {
      const action = parseRandomEntryPriceAction(lastUserMessage.content);
      if (action) {
        const updatedCount = await applyRandomEntryPriceAction(ruggerId, action);
        contextCache.delete(ruggerId);
        const context = await getCachedContext(ruggerId);
        const response: RuggerAiChatResponse = {
          answer:
            updatedCount > 0
              ? `C'est fait: j'ai mis à jour ${updatedCount} token${updatedCount > 1 ? 's' : ''} avec des points d'entrée aléatoires entre ${action.min} et ${action.max}.`
              : "Aucun token à modifier sur ce rugger.",
          strategy: buildFallbackStrategy(context),
          context: {
            tokenCount: context.tokenCount,
            generatedAt: new Date().toISOString(),
            source: 'fallback',
          },
        };
        return NextResponse.json(response);
      }
    }

    const context = await getCachedContext(ruggerId);
    const response = await generateRuggerAiResponse(context, normalizedMessages);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Failed to generate AI response' }, { status: 500 });
  }
}
