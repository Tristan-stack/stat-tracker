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

function normalizeModelName(model: string): string {
  return model.replace(/^models\//, '').trim();
}

async function listGenerateContentModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (cachedModels && now - cachedModels.at < MODEL_CACHE_TTL_MS) return cachedModels.values;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { method: 'GET' }
  );
  if (!response.ok) return [];
  const data = (await response.json()) as GeminiModelListResponse;
  const values =
    data.models
      ?.filter((item) => (item.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((item) => normalizeModelName(item.name ?? ''))
      .filter((item) => item !== '') ?? [];
  cachedModels = { at: now, values };
  return values;
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

function looksLikeMintExtractionRequest(content: string): boolean {
  const normalized = content.toLowerCase();
  const asksMint = normalized.includes('mint') || normalized.includes('mints');
  const asksList =
    normalized.includes('chaque') ||
    normalized.includes('tous') ||
    normalized.includes('tout') ||
    normalized.includes('liste');
  return asksMint && asksList;
}

function resolveMintDateRangeFromPrompt(content: string): { from: Date | null; to: Date | null } {
  const normalized = content.toLowerCase();
  const now = new Date();
  const currentYear = now.getFullYear();
  if (normalized.includes('depuis avril')) {
    return { from: new Date(currentYear, 3, 1, 0, 0, 0, 0), to: now };
  }
  return { from: null, to: null };
}

function buildMintExtractionAnswer(context: RuggerAiContext, userPrompt: string): string {
  const range = resolveMintDateRangeFromPrompt(userPrompt);
  const filteredMints = [
    ...new Set(
      context.tokens
        .filter((item) => {
          if (!range.from && !range.to) return true;
          const rawDate = item.purchasedAt;
          if (!rawDate) return false;
          const parsedDate = new Date(rawDate);
          if (Number.isNaN(parsedDate.getTime())) return false;
          if (range.from && parsedDate < range.from) return false;
          if (range.to && parsedDate > range.to) return false;
          return true;
        })
        .map((item) => item.tokenAddress?.trim() ?? '')
        .filter((item) => item !== '')
    ),
  ].sort();

  if (filteredMints.length === 0) {
    return 'Aucun mint trouvé pour ce rugger.\n\nTu veux aussi un résumé texte ?';
  }
  return `${filteredMints.join('\n')}\n\nTu veux aussi un résumé texte ?`;
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
        tokenMints: context.tokenMints,
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
    "Si l'utilisateur demande la liste des mints, retourne uniquement les mints (1 par ligne) dans `answer` et termine par: \"Tu veux aussi un résumé texte ?\"",
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
    answer: `Recommandation fallback locale utilisée. Cause Gemini: ${reason}.`,
    strategy: fallbackStrategy,
    context: {
      tokenCount: context.tokenCount,
      generatedAt: new Date().toISOString(),
      source: 'fallback',
    },
  });
  const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
  if (lastUserMessage && looksLikeMintExtractionRequest(lastUserMessage.content)) {
    return {
      answer: buildMintExtractionAnswer(context, lastUserMessage.content),
      strategy: fallbackStrategy,
      context: {
        tokenCount: context.tokenCount,
        generatedAt: new Date().toISOString(),
        source: 'fallback',
      },
    };
  }

  if (!apiKey) return buildFallbackResponse("clé API absente côté serveur (GOOGLE_API_KEY ou GEMINI_API_KEY)");

  const discoveredModels = await listGenerateContentModels(apiKey);
  const preferredCandidates = [
    process.env.GEMINI_MODEL?.trim(),
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ]
    .map((item) => normalizeModelName(item ?? ''))
    .filter((item) => item !== '');
  const modelCandidates = (
    discoveredModels.length > 0
      ? preferredCandidates.filter((item) => discoveredModels.includes(item))
      : preferredCandidates
  ).filter((item, index, array) => array.indexOf(item) === index);
  if (modelCandidates.length === 0) {
    return buildFallbackResponse('aucun modèle Gemini compatible generateContent trouvé (ListModels)');
  }
  let response: Response | null = null;
  let lastErrorMessage = 'erreur Gemini inconnue';

  for (const model of modelCandidates) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 12000);
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
      if (response.ok) break;
      const status = response.status;
      let details = '';
      try {
        details = (await response.text()).slice(0, 300);
      } catch {
        details = '';
      }
      lastErrorMessage = `${model} HTTP ${status}${details ? ` - ${details}` : ''}`;
      response = null;
      if (![404, 429, 500, 503].includes(status)) break;
    } catch {
      lastErrorMessage = `${model} erreur réseau/timeout`;
      response = null;
    } finally {
      clearTimeout(timeout);
    }
  }

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
