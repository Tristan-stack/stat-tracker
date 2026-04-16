import type { Token } from '@/types/token';

/** Filtre tableau tokens par date d’achat effective (coalesce purchasedAt / createdAt côté API). */
export type TokenPurchaseFilter = 'all' | 'today' | 'yesterday' | 'day' | 'custom';

export function getPurchaseFilterLabel(period: TokenPurchaseFilter): string {
  if (period === 'all') return 'Tous';
  if (period === 'today') return 'Aujourd\'hui';
  if (period === 'yesterday') return 'Hier';
  if (period === 'day') return 'Un jour';
  return 'Plage…';
}

function effectivePurchaseMs(token: Pick<Token, 'purchasedAt'>): number | null {
  const raw = token.purchasedAt?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

export interface TokenPurchaseFilterOptions {
  customFrom: string;
  customTo: string;
  /** `YYYY-MM-DD` — jour unique pour le filtre `day`. */
  pickDay: string;
}

/** Filtre client (liste locale) par date d’achat — aligné sur les plages `local*` du même module. */
export function tokenMatchesPurchaseFilter(
  token: Pick<Token, 'purchasedAt'>,
  filter: TokenPurchaseFilter,
  options: TokenPurchaseFilterOptions
): boolean {
  if (filter === 'all') return true;
  const ms = effectivePurchaseMs(token);
  if (ms === null) return false;
  if (filter === 'today') {
    const { fromMs, toMs } = localTodayPurchaseRange();
    return ms >= fromMs && ms <= toMs;
  }
  if (filter === 'yesterday') {
    const { fromMs, toMs } = localYesterdayPurchaseRange();
    return ms >= fromMs && ms <= toMs;
  }
  if (filter === 'day') {
    const { pickDay } = options;
    if (!pickDay.trim()) return false;
    const r = localCustomDayRange(pickDay, pickDay);
    if (!r) return false;
    return ms >= r.fromMs && ms <= r.toMs;
  }
  if (filter === 'custom') {
    const { customFrom, customTo } = options;
    if (!customFrom.trim() || !customTo.trim()) return false;
    const r = localCustomDayRange(customFrom, customTo);
    if (!r) return false;
    return ms >= r.fromMs && ms <= r.toMs;
  }
  return true;
}

/** Tri décroissant par date d’achat (comme `order by coalesce(purchased_at, …) desc` côté API rugger). Sans date : en bas. */
export function compareTokensByPurchaseDateDesc(
  a: Pick<Token, 'purchasedAt'>,
  b: Pick<Token, 'purchasedAt'>
): number {
  const ma = effectivePurchaseMs(a);
  const mb = effectivePurchaseMs(b);
  if (ma === null && mb === null) return 0;
  if (ma === null) return 1;
  if (mb === null) return -1;
  return mb - ma;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return x;
}

/** Plage « aujourd’hui » : minuit local → maintenant. */
export function localTodayPurchaseRange(): { fromMs: number; toMs: number } {
  const start = startOfLocalDay(new Date());
  return { fromMs: start.getTime(), toMs: Date.now() };
}

/** Plage « hier » : jour civil local précédent. */
export function localYesterdayPurchaseRange(): { fromMs: number; toMs: number } {
  const todayStart = startOfLocalDay(new Date());
  const yStart = new Date(todayStart);
  yStart.setDate(yStart.getDate() - 1);
  return { fromMs: yStart.getTime(), toMs: endOfLocalDay(yStart).getTime() };
}

/** Aligné sur la limite de l’API GMGN (`/api/gmgn/wallet-purchases`) : max ~366 jours jusqu’à maintenant. */
export function localGmgnAllTimeRange(): { fromMs: number; toMs: number } {
  const toMs = Date.now();
  const maxSpanMs = 366 * 86400000;
  return { fromMs: toMs - maxSpanMs, toMs };
}

/** `customFrom` / `customTo` : chaînes `YYYY-MM-DD` interprétées en calendrier local. */
export function localCustomDayRange(customFrom: string, customTo: string): { fromMs: number; toMs: number } | null {
  const parse = (s: string): [number, number, number] | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return [y, mo, d];
  };
  const a = parse(customFrom);
  const b = parse(customTo);
  if (!a || !b) return null;
  const from = new Date(a[0], a[1] - 1, a[2], 0, 0, 0, 0);
  const to = endOfLocalDay(new Date(b[0], b[1] - 1, b[2]));
  if (from.getTime() > to.getTime()) return null;
  return { fromMs: from.getTime(), toMs: to.getTime() };
}

export function appendTokenDateQueryParams(
  params: URLSearchParams,
  filter: TokenPurchaseFilter,
  customFrom?: string,
  customTo?: string,
  /** `YYYY-MM-DD` — un seul jour civil local (début → fin de journée). */
  pickDay?: string
): void {
  if (filter === 'all') return;
  if (filter === 'today') {
    const { fromMs, toMs } = localTodayPurchaseRange();
    params.set('tokenDateFrom', new Date(fromMs).toISOString());
    params.set('tokenDateTo', new Date(toMs).toISOString());
    return;
  }
  if (filter === 'yesterday') {
    const { fromMs, toMs } = localYesterdayPurchaseRange();
    params.set('tokenDateFrom', new Date(fromMs).toISOString());
    params.set('tokenDateTo', new Date(toMs).toISOString());
    return;
  }
  if (filter === 'day' && pickDay) {
    const r = localCustomDayRange(pickDay, pickDay);
    if (r) {
      params.set('tokenDateFrom', new Date(r.fromMs).toISOString());
      params.set('tokenDateTo', new Date(r.toMs).toISOString());
    }
    return;
  }
  if (filter === 'custom' && customFrom && customTo) {
    const r = localCustomDayRange(customFrom, customTo);
    if (r) {
      params.set('tokenDateFrom', new Date(r.fromMs).toISOString());
      params.set('tokenDateTo', new Date(r.toMs).toISOString());
    }
  }
}
