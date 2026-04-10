import type { Token } from '@/types/token';

export type InferredActivityHours =
  | {
      kind: 'estimate';
      startHour: number;
      endHour: number;
      sampleCount: number;
      /** Dispersion forte sur la journée (min → max > 14 h). */
      wideSpread: boolean;
    }
  | { kind: 'none'; reason: 'no_tokens' | 'no_dates' };

/**
 * Estime une tranche horaire d’activité à partir des `purchasedAt` (heure locale).
 * Utilise les déciles 10–90 % quand la dispersion est modérée, sinon min–max.
 */
export function inferActivityHoursFromTokens(
  tokens: Iterable<Pick<Token, 'purchasedAt' | 'hidden'>>
): InferredActivityHours {
  const hours: number[] = [];
  let visibleCount = 0;
  for (const t of tokens) {
    if (t.hidden) continue;
    visibleCount += 1;
    const raw = t.purchasedAt?.trim();
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    hours.push(d.getHours());
  }
  if (visibleCount === 0) return { kind: 'none', reason: 'no_tokens' };
  if (hours.length === 0) return { kind: 'none', reason: 'no_dates' };

  hours.sort((a, b) => a - b);
  const n = hours.length;
  const minH = hours[0];
  const maxH = hours[n - 1];
  const wideSpread = maxH - minH > 14;

  if (wideSpread) {
    return {
      kind: 'estimate',
      startHour: minH,
      endHour: maxH,
      sampleCount: n,
      wideSpread: true,
    };
  }

  const lowIdx = Math.max(0, Math.floor((n - 1) * 0.1));
  const highIdx = Math.min(n - 1, Math.ceil((n - 1) * 0.9));
  return {
    kind: 'estimate',
    startHour: hours[lowIdx],
    endHour: hours[highIdx],
    sampleCount: n,
    wideSpread: false,
  };
}
