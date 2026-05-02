import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { generateRuggerAiResponse } from '@/lib/ai/gemini';
import { loadRuggerAiContext, type RuggerAiContext } from '@/lib/ai/rugger-context';
import type { RuggerAiChatRequest } from '@/types/ai';

const CACHE_TTL_MS = 60 * 1000;
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1200;
const contextCache = new Map<string, { at: number; value: RuggerAiContext }>();

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
    const context = await getCachedContext(ruggerId);
    const response = await generateRuggerAiResponse(context, normalizedMessages);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Failed to generate AI response' }, { status: 500 });
  }
}
