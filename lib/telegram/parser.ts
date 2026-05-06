import type { TelegramParserResult } from '@/types/telegram';
import { extractPnlWithGemini } from '@/lib/telegram/parser-gemini';

const KEY_FIELDS = ['tokenMint', 'investedSol', 'soldSol', 'profitSol'] as const;

type PartialFields = Pick<
  TelegramParserResult,
  'tokenMint' | 'tokenName' | 'investedSol' | 'soldSol' | 'profitSol' | 'profitPct'
>;

/** Libellés « entrée » (argent mis / buy / deploy…). Ordre inclus dans \\b alternatives. */
const RE_LABEL_INVEST = new RegExp(
  String.raw`\b(?:buy|bought|invest(?:ed|ment)?|spent|deploy(?:ed)?|capital|entr(?:y|ance)?|purchase|cost|supply|supplying|budget|liquidity\s*deploy|deployment|opened|opened\s*with|started\s*with|position)\b`,
  'iu'
);

/** Libellés « sortie / vente ». */
const RE_LABEL_SOLD = new RegExp(
  String.raw`\b(?:sell|sold|sold\s*(?:for|at)?|recovery|recover|sell\s*(?:price|amount)?|exit|exited|exit\s*price|cashed|cashed\s*out|received|collected)\b`,
  'iu'
);

/** Libellés profit explicites (sinon invested − sold ci-dessous). */
const RE_LABEL_PROFIT = new RegExp(
  String.raw`\b(?:profit|pnl|(?:net\s+)?gain|earnings?|earning|difference|Δ|delta|rug\s*gain)\b`,
  'iu'
);

function logTelegramParse(payload: Record<string, unknown>): void {
  const line = JSON.stringify({ scope: 'telegram-pnl-parse', ts: new Date().toISOString(), ...payload });
  if (
    payload.event === 'parse_regex_ok' ||
    payload.event === 'parse_gemini_ok'
  ) {
    console.info(line);
    return;
  }
  console.warn(line);
}

function parseLocaleNumberChunk(raw: string): number | null {
  const t = raw
    .trim()
    .replace(/\s+/gu, '')
    .replace(/^\+/u, '')
    .replace(',', '.')
    .replace(/^\.+/u, '');
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Trouve une ligne où le libellé apparaît, puis le montant suivant « : » ou espace ;
 * SOL / Ⓢ facultatif ; permet emojis après le montant (plus de blocage `$`/`SOL`).
 */
function extractAmountNearLabel(lines: readonly string[], labelRegex: RegExp): number | null {
  const amountAfterLabel = new RegExp(
    labelRegex.source +
      String.raw`\s*[：:]?\s*([+-]?\s*\d[\d\s.,]*|\s*[+-]\s*\d[\d\s.,]*)(?:\s*(?:SOL|Ⓢ(?:OL)?|◎))?\s*[^\d\n]*?$`,
    'iu'
  );
  for (const rawLine of lines) {
    const line = rawLine.normalize('NFKC').trimEnd();
    if (!line.trim()) continue;
    if (!labelRegex.test(line)) continue;
    labelRegex.lastIndex = 0;
    const m = amountAfterLabel.exec(line);
    if (!m?.[1]) continue;
    const n = parseLocaleNumberChunk(m[1]);
    if (n != null) return n;
  }
  return null;
}

function mintFromGmgnDexLinks(block: string): string | null {
  /** URL type …/sol/token/MINT ou …token/MINT avec query. */
  const fromUrl =
    /\b(?:gmgn\.ai|dexscreener\.com|birdeye\.so|solscan\.io|solana\.fm|explorer)[^\s)]+(?:token|mint)\/([1-9A-HJ-NP-Za-km-z]{32,44})\b/im.exec(block) ??
    /\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})\b/im.exec(block);
  return fromUrl?.[1]?.trim() ?? null;
}

/**
 * Une seule adresse Solana plausible dans tout le bloc → souvent le mint RugPilot.
 */
function inferUniqueMint(block: string): string | null {
  const matches = [...block.matchAll(/\b([1-9A-HJ-NP-Za-km-z]{43,44})\b/giu)];
  if (matches.length === 0) return null;
  const unique = [...new Set(matches.map((item) => item[1]))];
  return unique.length === 1 ? unique[0] : null;
}

function inferRareMintFallback(block: string): string | null {
  /** Mints un peu plus courts / longs dans la famille base58 projet. */
  const wide = [...block.matchAll(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/giu)];
  if (wide.length === 0) return null;
  const unique = [...new Set(wide.map((item) => item[1]))];
  if (unique.length === 1) return unique[0];
  return null;
}

/** Heuristique RugPilot / posts PnL : mint + montants (robuste emojis / pas de SOL en fin). */
export function tryParsePnlWithRegex(raw: string): PartialFields {
  const block = raw.replace(/\r\n/gu, '\n');
  const lines = block.split(/\n/).map((l) => l.normalize('NFKC'));

  let tokenMint: string | null = null;

  const mintFromUrl = mintFromGmgnDexLinks(block);
  const mintLabeled =
    /(?:mint|contract|\bCA\b|token\s*address|🔗|🔗\s*|address|spl)\s*[：:]?\s*(?!https?:\/\/)([1-9A-HJ-NP-Za-km-z]{32,44})\b/im.exec(block);

  tokenMint =
    mintFromUrl ??
    mintLabeled?.[1]?.trim() ??
    null;

  if (!tokenMint) {
    tokenMint = inferUniqueMint(block) ?? inferRareMintFallback(block);
  }
  if (!tokenMint) {
    const bareCtx = /\b([1-9A-HJ-NP-Za-km-z]{43,44})\b/gu;
    let m: RegExpExecArray | null;
    while ((m = bareCtx.exec(block)) !== null) {
      const candidate = m[1];
      const start = Math.max(0, m.index - 20);
      const ctx = block.slice(start, m.index).toLowerCase();
      if (/(?:mint|ca|contract|addr|spl|dex|🔗)/iu.test(ctx)) {
        tokenMint = candidate;
        break;
      }
    }
  }

  const nameMatch =
    /\b(?:name|sym|symb(?:ol)?|ticker|\$)\s*[:#]?\s*([^\n]{1,42})/im.exec(block) ??
    /^\*{1,3}\s*([^*\n]{1,32})\s*\*{1,3}\s*$/imu.exec(lines[0] ?? '');
  let tokenName: string | null = null;
  if (nameMatch?.[1])
    tokenName = nameMatch[1].replace(/\([^)]*\)/gu, '').trim().slice(0, 48) || null;

  const investedSol = extractAmountNearLabel(lines, RE_LABEL_INVEST);
  const soldSol = extractAmountNearLabel(lines, RE_LABEL_SOLD);
  let profitSol = extractAmountNearLabel(lines, RE_LABEL_PROFIT);

  let profitPct: number | null = null;
  const pctMatch =
    /\b(?:profit|pnl|gain|roi)[^%\n]{0,32}?([+\-]?\s*[\d.,]+\s*)%/imu.exec(block) ??
    /\(([+\-]?\s*[\d.,]+\s*)%\)/imu.exec(block);
  if (pctMatch?.[1]) profitPct = parseLocaleNumberChunk(pctMatch[1]);

  if (
    profitSol === null &&
    investedSol != null &&
    soldSol != null
  ) {
    profitSol = soldSol - investedSol;
  }

  return {
    tokenMint,
    tokenName,
    investedSol,
    soldSol,
    profitSol,
    profitPct,
  };
}

export function missingPnlKeys(p: PartialFields): (typeof KEY_FIELDS)[number][] {
  return KEY_FIELDS.filter((key) => p[key] == null);
}

function hasAllKeys(p: PartialFields): boolean {
  return missingPnlKeys(p).length === 0;
}

function skipGeminiFallback(): boolean {
  const v = process.env.TELEGRAM_PNL_USE_GEMINI_FALLBACK?.trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

export async function parsePnlMessage(
  channelSlug: string,
  messageId: bigint,
  raw: string
): Promise<TelegramParserResult> {
  const trimmed = raw.trim();
  if (!trimmed) {
    logTelegramParse({
      event: 'parse_full_failure',
      channel: channelSlug,
      messageId: String(messageId),
      reason: 'empty_text',
    });
    return {
      source: 'failed',
      tokenMint: null,
      tokenName: null,
      investedSol: null,
      soldSol: null,
      profitSol: null,
      profitPct: null,
      error: 'empty_message',
    };
  }

  const regexDraft = tryParsePnlWithRegex(trimmed);

  if (hasAllKeys(regexDraft)) {
    logTelegramParse({
      event: 'parse_regex_ok',
      channel: channelSlug,
      messageId: String(messageId),
      fields: KEY_FIELDS.reduce<Record<string, boolean>>((acc, k) => {
        acc[k] = regexDraft[k] != null;
        return acc;
      }, {}),
    });
    return { source: 'regex', ...regexDraft };
  }

  const missing = missingPnlKeys(regexDraft);
  logTelegramParse({
    event: 'parse_regex_partial_fallback_gemini',
    channel: channelSlug,
    messageId: String(messageId),
    missingFields: missing,
    regexSnapshot: {
      tokenMint: Boolean(regexDraft.tokenMint),
      investedSol: regexDraft.investedSol != null,
      soldSol: regexDraft.soldSol != null,
      profitSol: regexDraft.profitSol != null,
    },
  });

  if (skipGeminiFallback()) {
    logTelegramParse({
      event: 'parse_regex_partial_no_gemini',
      channel: channelSlug,
      messageId: String(messageId),
      missingFields: missing,
    });
    logTelegramParse({
      event: 'parse_full_failure',
      channel: channelSlug,
      messageId: String(messageId),
      reason: 'regex_partial_fallback_disabled',
    });
    return {
      source: 'failed',
      tokenMint: regexDraft.tokenMint,
      tokenName: regexDraft.tokenName,
      investedSol: regexDraft.investedSol,
      soldSol: regexDraft.soldSol,
      profitSol: regexDraft.profitSol,
      profitPct: regexDraft.profitPct,
      error: 'regex_partial_TELEGRAM_PNL_USE_GEMINI_FALLBACK=0',
    };
  }

  const startedGemini = Date.now();
  const geminiDraft = await extractPnlWithGemini(trimmed);
  const latencyMs = Date.now() - startedGemini;

  if (geminiDraft && hasAllKeys(geminiDraft)) {
    logTelegramParse({
      event: 'parse_gemini_ok',
      channel: channelSlug,
      messageId: String(messageId),
      latencyMs,
    });
    return { ...geminiDraft, profitPct: geminiDraft.profitPct ?? regexDraft.profitPct };
  }

  const reasonGemini =
    geminiDraft == null ? 'gemini_unreachable_or_invalid_json' : 'gemini_partial_fields';

  logTelegramParse({
    event: 'parse_gemini_failed',
    channel: channelSlug,
    messageId: String(messageId),
    latencyMs,
    reason: reasonGemini,
  });

  logTelegramParse({
    event: 'parse_full_failure',
    channel: channelSlug,
    messageId: String(messageId),
    reason: reasonGemini,
  });

  return {
    source: 'failed',
    tokenMint: geminiDraft?.tokenMint ?? regexDraft.tokenMint,
    tokenName: geminiDraft?.tokenName ?? regexDraft.tokenName,
    investedSol: geminiDraft?.investedSol ?? regexDraft.investedSol,
    soldSol: geminiDraft?.soldSol ?? regexDraft.soldSol,
    profitSol: geminiDraft?.profitSol ?? regexDraft.profitSol,
    profitPct: geminiDraft?.profitPct ?? regexDraft.profitPct,
    error: reasonGemini,
  };
}
