import type { AiChatMessage, AiStrategyPayload, RuggerAiChatResponse } from '@/types/ai';
import type { RuggerAiContext } from '@/lib/ai/rugger-context';
import { buildFallbackStrategy } from '@/lib/ai/rugger-strategy';

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
}

interface GeminiStructuredOutput {
  answer: string;
  strategy: AiStrategyPayload;
}

interface GeminiModelListResponse {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
}

const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedModels: { at: number; values: string[] } | null = null;

/** Ordre de préférence si l’API ne impose pas autre chose ; aucun .env requis. */
const DEFAULT_GEMINI_MODEL_ORDER = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
] as const;

const MIN_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 120_000;

function resolveRequestTimeoutMs(): number {
  const raw = process.env.GEMINI_REQUEST_TIMEOUT_MS?.trim();
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : NaN;
  const fallback = 30_000;
  const n = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, n));
}

function logRuggerGemini(payload: Record<string, unknown>): void {
  const line = JSON.stringify({ scope: 'rugger-gemini', ts: new Date().toISOString(), ...payload });
  if (payload.event === 'generate_ok') console.info(line);
  else console.warn(line);
}

function normalizeModelName(model: string): string {
  return model.replace(/^models\//, '').trim();
}

async function listGenerateContentModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (cachedModels && now - cachedModels.at < MODEL_CACHE_TTL_MS) return cachedModels.values;
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(listUrl, { method: 'GET' });
  if (!response.ok) {
    logRuggerGemini({
      event: 'list_models_failed',
      httpStatus: response.status,
      hint: 'fallback sur la liste de modèles statique',
    });
    return [];
  }
  const data = (await response.json()) as GeminiModelListResponse;
  const values =
    data.models
      ?.filter((item) => (item.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((item) => normalizeModelName(item.name ?? ''))
      .filter((item) => item !== '') ?? [];
  cachedModels = { at: now, values };
  logRuggerGemini({ event: 'list_models_ok', modelCount: values.length });
  return values;
}

function buildModelCandidates(discovered: string[]): string[] {
  const override = normalizeModelName(process.env.GEMINI_MODEL?.trim() ?? '');
  const preferred = [
    ...(override !== '' ? [override] : []),
    ...DEFAULT_GEMINI_MODEL_ORDER,
  ].map((item) => normalizeModelName(item));
  const unique = preferred.filter((item, index, array) => item !== '' && array.indexOf(item) === index);
  if (discovered.length === 0) {
    logRuggerGemini({
      event: 'model_selection',
      mode: 'static_only',
      candidates: unique.slice(0, 8),
    });
    return unique;
  }
  const intersection = unique.filter((item) => discovered.includes(item));
  if (intersection.length > 0) {
    logRuggerGemini({
      event: 'model_selection',
      mode: 'intersection',
      candidates: intersection,
      discoveredCount: discovered.length,
      hasOverride: override !== '',
    });
    return intersection;
  }
  logRuggerGemini({
    event: 'model_selection',
    mode: 'static_fallback_no_intersection',
    discoveredSample: discovered.slice(0, 8),
    candidates: unique.slice(0, 8),
    hasOverride: override !== '',
  });
  return unique;
}

function toGeminiContents(messages: AiChatMessage[]): GeminiContent[] {
  return messages
    .filter((item) => item.content.trim() !== '')
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }],
    }));
}

function safeParseGeminiOutput(raw: string): GeminiStructuredOutput | null {
  try {
    const parsed = JSON.parse(raw) as GeminiStructuredOutput;
    if (!parsed || typeof parsed.answer !== 'string' || !parsed.strategy) return null;
    return parsed;
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}$/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]) as GeminiStructuredOutput;
      if (!parsed || typeof parsed.answer !== 'string' || !parsed.strategy) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}

function buildSystemPrompt(context: RuggerAiContext): string {
  const sampleTokens = context.tokens.slice(0, 25).map((item) => ({
    token: item.tokenName ?? item.name,
    entryPrice: item.entryPrice,
    high: item.high,
    low: item.low,
    targetExitPercent: item.targetExitPercent,
    status: item.statusId ?? 'unknown',
    purchasedAt: item.purchasedAt ?? null,
  }));
  return [
    'Tu es un analyste IA spécialisé en stratégies de tokens.',
    "Objectif: fournir des recommandations concrètes orientées performance et filtrage.",
    'Réponds en français.',
    'Important: détecte les changements de tendance et signale si la stratégie récente semble obsolète.',
    'Ne fournis jamais de conseil financier garanti.',
    '',
    'Contexte Rugger JSON:',
    JSON.stringify(
      {
        ruggerId: context.ruggerId,
        tokenCount: context.tokenCount,
        trends: context.trends,
        statusBreakdown: context.statusBreakdown,
        latestAnalysis: context.latestAnalysis,
        sampleTokens,
      },
      null,
      2
    ),
    '',
    'Tu dois répondre strictement en JSON au format suivant:',
    JSON.stringify(
      {
        answer: 'string',
        strategy: {
          recommendedStrategy: 'string',
          suggestedFilters: {
            entryMcapMin: 100000,
            entryMcapMax: 500000,
            minHighPercent: 40,
            maxLossPercent: -35,
            recentWindowDays: 14,
            avoidStatuses: ['failed'],
          },
          riskNotes: ['string'],
          trendShiftWarning: 'string|null',
          validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          confidence: 'low|medium|high',
        },
      },
      null,
      2
    ),
  ].join('\n');
}

export async function generateRuggerAiResponse(
  context: RuggerAiContext,
  messages: AiChatMessage[]
): Promise<RuggerAiChatResponse> {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  const fallbackStrategy = buildFallbackStrategy(context);
  const buildFallbackResponse = (reason: string): RuggerAiChatResponse => ({
    answer: `Stratégie de secours (calcul local, sans Gemini). Motif : ${reason}.`,
    strategy: fallbackStrategy,
    context: {
      tokenCount: context.tokenCount,
      generatedAt: new Date().toISOString(),
      source: 'fallback',
    },
  });
  if (!apiKey) return buildFallbackResponse("clé API absente côté serveur (GOOGLE_API_KEY ou GEMINI_API_KEY)");

  const timeoutMs = resolveRequestTimeoutMs();
  const discoveredModels = await listGenerateContentModels(apiKey);
  const modelCandidates = buildModelCandidates(discoveredModels);
  if (modelCandidates.length === 0) {
    return buildFallbackResponse('aucun modèle Gemini compatible generateContent trouvé (ListModels)');
  }

  const failureNotes: string[] = [];
  let response: Response | null = null;

  for (const model of modelCandidates) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), timeoutMs);
      const started = Date.now();
      logRuggerGemini({
        event: 'generate_attempt',
        ruggerId: context.ruggerId,
        model,
        attempt,
        maxAttempts,
        timeoutMs,
      });
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({
              contents: toGeminiContents(messages),
              systemInstruction: {
                parts: [{ text: buildSystemPrompt(context) }],
              },
              generationConfig: {
                temperature: 0.2,
                responseMimeType: 'application/json',
              },
            }),
          }
        );
        const elapsedMs = Date.now() - started;
        if (response.ok) {
          logRuggerGemini({
            event: 'generate_ok',
            ruggerId: context.ruggerId,
            model,
            attempt,
            elapsedMs,
          });
          clearTimeout(timer);
          break;
        }
        const status = response.status;
        let details = '';
        try {
          details = (await response.text()).slice(0, 280);
        } catch {
          details = '';
        }
        const note = `${model} HTTP ${status}${details ? ` — ${details}` : ''}`;
        failureNotes.push(note);
        logRuggerGemini({
          event: 'generate_http_error',
          ruggerId: context.ruggerId,
          model,
          attempt,
          elapsedMs,
          httpStatus: status,
          detailSnippet: details.slice(0, 120),
        });
        response = null;
        clearTimeout(timer);
        break;
      } catch (err) {
        const elapsedMs = Date.now() - started;
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const note = isAbort
          ? `${model} timeout après ${timeoutMs}ms (tentative ${attempt}/${maxAttempts})`
          : `${model} erreur réseau: ${err instanceof Error ? err.message : String(err)}`;
        logRuggerGemini({
          event: 'generate_fetch_error',
          ruggerId: context.ruggerId,
          model,
          attempt,
          elapsedMs,
          isAbort,
          errorName: err instanceof Error ? err.name : 'unknown',
        });
        response = null;
        clearTimeout(timer);
        if (isAbort && attempt < maxAttempts) {
          continue;
        }
        failureNotes.push(note);
        break;
      }
    }
    if (response) break;
  }

  const lastErrorMessage =
    failureNotes.length > 0
      ? failureNotes.slice(-3).join(' | ')
      : 'erreur Gemini inconnue';

  if (!response) return buildFallbackResponse(lastErrorMessage);

  const data = (await response.json()) as GeminiResponse;
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return buildFallbackResponse('réponse Gemini vide');

  const parsed = safeParseGeminiOutput(rawText);
  if (!parsed) return buildFallbackResponse('format JSON Gemini invalide');

  return {
    answer: parsed.answer,
    strategy: parsed.strategy,
    context: {
      tokenCount: context.tokenCount,
      generatedAt: new Date().toISOString(),
      source: 'gemini',
    },
  };
}
