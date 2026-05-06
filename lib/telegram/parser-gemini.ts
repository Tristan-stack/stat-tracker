import type { TelegramParserResult } from '@/types/telegram';

interface GeminiPart {
  text: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
}

interface GeminiModelListResponse {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
}

const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
let cachedModels: { at: number; values: string[] } | null = null;

const DEFAULT_GEMINI_MODEL_ORDER = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
] as const;

const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 90_000;

function logTelegramPnLGemini(payload: Record<string, unknown>): void {
  const line = JSON.stringify({ scope: 'telegram-pnl-gemini', ts: new Date().toISOString(), ...payload });
  if (payload.event === 'generate_ok') console.info(line);
  else console.warn(line);
}

function resolveRequestTimeoutMs(): number {
  const raw = process.env.TELEGRAM_GEMINI_TIMEOUT_MS?.trim() ?? process.env.GEMINI_REQUEST_TIMEOUT_MS?.trim();
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : NaN;
  const fallback = 45_000;
  const n = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, n));
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
    logTelegramPnLGemini({
      event: 'list_models_failed',
      httpStatus: response.status,
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
  logTelegramPnLGemini({ event: 'list_models_ok', modelCount: values.length });
  return values;
}

function buildModelCandidates(discovered: string[]): string[] {
  const override = normalizeModelName(process.env.GEMINI_MODEL?.trim() ?? '');
  const preferred = [...(override !== '' ? [override] : []), ...DEFAULT_GEMINI_MODEL_ORDER].map((item) =>
    normalizeModelName(item)
  );
  const unique = preferred.filter((item, index, array) => item !== '' && array.indexOf(item) === index);
  if (discovered.length === 0) return unique;
  const intersection = unique.filter((item) => discovered.includes(item));
  if (intersection.length > 0) return intersection;
  return unique;
}

type ExtractedPnl = Pick<
  TelegramParserResult,
  'tokenMint' | 'tokenName' | 'investedSol' | 'soldSol' | 'profitSol' | 'profitPct'
>;

function safeParseExtracted(rawText: string): ExtractedPnl | null {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const tokenMint = typeof parsed.tokenMint === 'string' ? parsed.tokenMint.trim() || null : null;
    const tokenName = typeof parsed.tokenName === 'string' ? parsed.tokenName.trim() || null : null;
    const investedSol = typeof parsed.investedSol === 'number' && Number.isFinite(parsed.investedSol) ? parsed.investedSol : null;
    const soldSol = typeof parsed.soldSol === 'number' && Number.isFinite(parsed.soldSol) ? parsed.soldSol : null;
    const profitSol = typeof parsed.profitSol === 'number' && Number.isFinite(parsed.profitSol) ? parsed.profitSol : null;
    const profitPct =
      typeof parsed.profitPct === 'number' && Number.isFinite(parsed.profitPct) ? parsed.profitPct : null;
    return { tokenMint, tokenName, investedSol, soldSol, profitSol, profitPct };
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return safeParseExtracted(jsonMatch[0]);
  }
}

const PNl_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tokenMint: { type: 'STRING', nullable: true },
    tokenName: { type: 'STRING', nullable: true },
    investedSol: { type: 'NUMBER', nullable: true },
    soldSol: { type: 'NUMBER', nullable: true },
    profitSol: { type: 'NUMBER', nullable: true },
    profitPct: { type: 'NUMBER', nullable: true },
  },
};

const SYSTEM_PROMPT = [
  'Tu extrais les champs d’un post Telegram de profit (rug / token Solana).',
  'Réponds uniquement avec un JSON objet selon le schéma : tokenMint (adresse base58 32-44 car si présente), tokenName (symbole/nom court si visible),',
  'investedSol, soldSol, profitSol en SOL (nombres décimaux, signe autorisé pour profit).',
  'profitPct si le texte donne un pourcentage explicite (%), sinon null.',
  'Si une valeur absente ou ambiguë, mets null pour ce champ (ne devine pas hors texte).',
].join(' ');

/**
 * Extraction structurée ; appelé après échec regex partiel.
 */
export async function extractPnlWithGemini(rawText: string): Promise<TelegramParserResult | null> {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logTelegramPnLGemini({ event: 'missing_api_key' });
    return null;
  }

  const discovered = await listGenerateContentModels(apiKey);
  const modelCandidates = buildModelCandidates(discovered);
  if (modelCandidates.length === 0) return null;

  const timeoutMs = resolveRequestTimeoutMs();
  const failureNotes: string[] = [];
  let response: Response | null = null;

  for (const model of modelCandidates) {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), timeoutMs);
      const started = Date.now();
      logTelegramPnLGemini({
        event: 'generate_attempt',
        model,
        attempt,
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
              contents: [{ role: 'user', parts: [{ text: rawText.slice(0, 12_000) }] }],
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json',
                responseSchema: PNl_RESPONSE_SCHEMA,
              },
            }),
          }
        );
        const elapsedMs = Date.now() - started;
        if (response.ok) {
          logTelegramPnLGemini({ event: 'generate_ok', model, attempt, elapsedMs });
          clearTimeout(timer);
          break;
        }
        const status = response.status;
        let details = '';
        try {
          details = (await response.text()).slice(0, 400);
        } catch {
          details = '';
        }
        failureNotes.push(`${model} HTTP ${status} — ${details.slice(0, 120)}`);
        logTelegramPnLGemini({
          event: 'generate_http_error',
          model,
          attempt,
          httpStatus: status,
          detailSnippet: details.slice(0, 140),
        });
        response = null;
        clearTimeout(timer);
        break;
      } catch (err) {
        const elapsedMs = Date.now() - started;
        const isAbort = err instanceof Error && err.name === 'AbortError';
        logTelegramPnLGemini({
          event: 'generate_fetch_error',
          model,
          attempt,
          elapsedMs,
          isAbort,
          errorName: err instanceof Error ? err.name : 'unknown',
        });
        response = null;
        clearTimeout(timer);
        if (isAbort && attempt < maxAttempts) continue;
        failureNotes.push(
          isAbort
            ? `${model} timeout après ${timeoutMs}ms`
            : `${model} erreur: ${err instanceof Error ? err.message : String(err)}`
        );
        break;
      }
    }
    if (response?.ok) break;
  }

  if (!response?.ok) {
    logTelegramPnLGemini({
      event: 'give_up_models',
      lastErrors: failureNotes.slice(-5),
    });
    return null;
  }

  const data = (await response.json()) as GeminiResponse;
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) return null;

  const extracted = safeParseExtracted(raw);
  if (!extracted) return null;

  return {
    source: 'gemini',
    tokenMint: extracted.tokenMint,
    tokenName: extracted.tokenName,
    investedSol: extracted.investedSol,
    soldSol: extracted.soldSol,
    profitSol: extracted.profitSol,
    profitPct: extracted.profitPct,
  };
}
