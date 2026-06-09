import { query } from '@/lib/db';
import { MIGRATION_MCAP_THRESHOLD } from '@/lib/migration';
import { badRequest } from '@/lib/api/errors';
import type { Token } from '@/types/token';
import type { StatusId } from '@/types/rugger';

export interface DbToken {
  id: string;
  rugger_id: string;
  name: string;
  entry_price: number;
  high: number;
  low: number;
  entry_to_low_minutes: number | null;
  target_exit_percent: number;
  status_id: StatusId;
  created_at: string;
  purchased_at: string | null;
  token_address: string | null;
  token_name: string | null;
}

const SELECT_COLS =
  'id, rugger_id, name, entry_price, high, low, entry_to_low_minutes, target_exit_percent, status_id, created_at, purchased_at, token_address, token_name';

/** Point unique de mapping DbToken → Token. */
export function mapToken(row: DbToken): Token {
  const t: Token = {
    id: row.id,
    name: row.name,
    entryPrice: row.entry_price,
    high: row.high,
    low: row.low,
    targetExitPercent: row.target_exit_percent,
    statusId: row.status_id,
  };
  if (row.purchased_at) t.purchasedAt = new Date(row.purchased_at).toISOString();
  if (row.token_address) t.tokenAddress = row.token_address;
  if (row.token_name) t.tokenName = row.token_name;
  if (row.entry_to_low_minutes != null && Number.isFinite(row.entry_to_low_minutes)) {
    t.entryToLowMinutes = row.entry_to_low_minutes;
  }
  return t;
}

export interface TokenListFilters {
  status: StatusId | null;
  dateFromIso: string | null;
  dateToIso: string | null;
  entryMcapMin: number | null;
  entryMcapMax: number | null;
  migrationOnly: boolean;
}

/** Construit la clause WHERE dynamique + params à partir des filtres. */
function buildWhere(ruggerId: string, f: TokenListFilters): { clause: string; params: (string | number)[] } {
  const conditions: string[] = ['rugger_id = $1'];
  const params: (string | number)[] = [ruggerId];
  const effectiveTs = 'coalesce(purchased_at, created_at)';

  if (f.status) {
    conditions.push(`status_id = $${params.length + 1}`);
    params.push(f.status);
  }
  if (f.dateFromIso) {
    conditions.push(`${effectiveTs} >= $${params.length + 1}`);
    params.push(f.dateFromIso);
  }
  if (f.dateToIso) {
    conditions.push(`${effectiveTs} <= $${params.length + 1}`);
    params.push(f.dateToIso);
  }
  if (f.entryMcapMin != null) {
    conditions.push(`entry_price >= $${params.length + 1}`);
    params.push(f.entryMcapMin);
  }
  if (f.entryMcapMax != null) {
    conditions.push(`entry_price <= $${params.length + 1}`);
    params.push(f.entryMcapMax);
  }
  if (f.migrationOnly) {
    conditions.push(`high >= $${params.length + 1}`);
    params.push(MIGRATION_MCAP_THRESHOLD);
  }
  return { clause: 'where ' + conditions.join(' and '), params };
}

export interface TokenListResult {
  tokens: Token[];
  total: number;
  allSameTargetPercent: number | null;
}

export async function listTokens(args: {
  ruggerId: string;
  filters: TokenListFilters;
  fetchAll: boolean;
  page: number;
  pageSize: number;
}): Promise<TokenListResult> {
  const { clause, params } = buildWhere(args.ruggerId, args.filters);

  const countRows = await query<{ count: string }>(
    `select count(*)::text as count from rugger_tokens ${clause}`,
    params
  );
  const total = Number(countRows[0]?.count ?? '0');

  const orderBy = 'order by coalesce(purchased_at, created_at) desc';
  const rows = args.fetchAll
    ? await query<DbToken>(`select ${SELECT_COLS} from rugger_tokens ${clause} ${orderBy}`, params)
    : await query<DbToken>(
        `select ${SELECT_COLS} from rugger_tokens ${clause} ${orderBy} limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, args.pageSize, (args.page - 1) * args.pageSize]
      );

  let allSameTargetPercent: number | null = null;
  if (total > 0) {
    const distinctRows = await query<{ target_exit_percent: number }>(
      `select distinct target_exit_percent from rugger_tokens ${clause}`,
      params
    );
    if (distinctRows.length === 1) allSameTargetPercent = distinctRows[0].target_exit_percent;
  }

  return { tokens: rows.map(mapToken), total, allSameTargetPercent };
}

export async function getRuggerStatusId(ruggerId: string, userId: string): Promise<StatusId> {
  const rows = await query<{ status_id: StatusId }>(
    'select status_id from ruggers where id = $1 and user_id = $2',
    [ruggerId, userId]
  );
  return rows[0]?.status_id ?? 'verification';
}

export async function deleteAllTokens(ruggerId: string): Promise<void> {
  await query('delete from rugger_tokens where rugger_id = $1', [ruggerId]);
}

/** Set des mints déjà présents (token_address sinon name) pour la déduplication. */
export async function getExistingTokenMints(ruggerId: string): Promise<Set<string>> {
  const rows = await query<{ token_address: string | null; name: string }>(
    'SELECT token_address, name FROM rugger_tokens WHERE rugger_id = $1',
    [ruggerId]
  );
  const set = new Set<string>();
  for (const r of rows) {
    const mint = r.token_address?.trim() || r.name.trim();
    if (mint !== '') set.add(mint);
  }
  return set;
}

/** Insère en masse des tokens nettoyés. Retourne le nombre inséré. */
export async function bulkInsertTokens(
  ruggerId: string,
  statusId: StatusId,
  tokens: Token[]
): Promise<number> {
  const values: (string | number | null)[] = [];
  const placeholders: string[] = [];

  tokens.forEach((token, index) => {
    const base = index * 12;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12})`
    );
    const purchasedIso =
      typeof token.purchasedAt === 'string' && token.purchasedAt.trim() !== '' && !Number.isNaN(new Date(token.purchasedAt).getTime())
        ? new Date(token.purchasedAt).toISOString()
        : null;
    const tokenAddr =
      typeof token.tokenAddress === 'string' && token.tokenAddress.trim() !== ''
        ? token.tokenAddress.trim()
        : null;
    const tokenLabel =
      typeof token.tokenName === 'string' && token.tokenName.trim() !== ''
        ? token.tokenName.trim()
        : null;
    const entryToLow =
      typeof token.entryToLowMinutes === 'number' && Number.isFinite(token.entryToLowMinutes)
        ? token.entryToLowMinutes
        : null;
    values.push(
      crypto.randomUUID(),
      ruggerId,
      token.name,
      token.entryPrice,
      token.high,
      token.low,
      token.targetExitPercent,
      statusId,
      purchasedIso,
      tokenAddr,
      tokenLabel,
      entryToLow
    );
  });

  await query(
    `insert into rugger_tokens
       (id, rugger_id, name, entry_price, high, low, target_exit_percent, status_id, purchased_at, token_address, token_name, entry_to_low_minutes)
     values ${placeholders.join(', ')}`,
    values
  );
  return tokens.length;
}

export async function setTargetExitPercentForRugger(ruggerId: string, percent: number): Promise<void> {
  await query('update rugger_tokens set target_exit_percent = $1 where rugger_id = $2', [percent, ruggerId]);
}

export async function setTargetExitMcapForRugger(ruggerId: string, mcap: number): Promise<void> {
  await query(
    'update rugger_tokens set target_exit_percent = (($1 / entry_price) - 1) * 100 where rugger_id = $2 and entry_price > 0',
    [mcap, ruggerId]
  );
}

// ---------------------------------------------------------------------------
// Update / delete d'un token unique
// ---------------------------------------------------------------------------

export interface RuggerTokenPatch {
  targetExitPercent?: number;
  entryPrice?: number;
  high?: number;
  low?: number;
  purchasedAt?: string | null;
  tokenAddress?: string | null;
  name?: string;
  tokenName?: string | null;
  entryToLowMinutes?: number | null;
}

function isMissingEntryToLowColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (!/entry_to_low/i.test(msg)) return false;
  const code =
    err !== null && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (code === '42703') return true;
  return /does not exist|undefined_column|42703/i.test(msg);
}

/** Construit SET … pour `rugger_tokens` ; lève `ApiError(400)` sur champ invalide. */
function buildTokenPatchParts(
  patch: RuggerTokenPatch,
  omitEntryToLow: boolean
): { clauses: string[]; values: (number | string | null)[] } {
  const clauses: string[] = [];
  const values: (number | string | null)[] = [];
  const push = (col: string, value: number | string | null) => {
    clauses.push(`${col} = $${values.length + 1}`);
    values.push(value);
  };

  if (patch.targetExitPercent !== undefined) {
    if (!Number.isFinite(patch.targetExitPercent)) throw badRequest('targetExitPercent must be a number');
    push('target_exit_percent', patch.targetExitPercent);
  }
  if (patch.entryPrice !== undefined) {
    if (!Number.isFinite(patch.entryPrice) || patch.entryPrice < 0) throw badRequest('entryPrice must be a non-negative number');
    push('entry_price', patch.entryPrice);
  }
  if (patch.high !== undefined) {
    if (!Number.isFinite(patch.high) || patch.high < 0) throw badRequest('high must be a non-negative number');
    push('high', patch.high);
  }
  if (patch.low !== undefined) {
    if (!Number.isFinite(patch.low) || patch.low < 0) throw badRequest('low must be a non-negative number');
    push('low', patch.low);
  }
  if (patch.purchasedAt !== undefined) {
    if (patch.purchasedAt === null || patch.purchasedAt === '') {
      push('purchased_at', null);
    } else if (typeof patch.purchasedAt === 'string') {
      const d = new Date(patch.purchasedAt);
      if (Number.isNaN(d.getTime())) throw badRequest('purchasedAt must be a valid ISO date string');
      push('purchased_at', d.toISOString());
    } else {
      throw badRequest('purchasedAt invalid');
    }
  }
  if (patch.tokenAddress !== undefined) {
    if (patch.tokenAddress === null || patch.tokenAddress === '') push('token_address', null);
    else if (typeof patch.tokenAddress === 'string') push('token_address', patch.tokenAddress.trim());
    else throw badRequest('tokenAddress invalid');
  }
  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string' || patch.name.trim() === '') throw badRequest('name must be a non-empty string');
    push('name', patch.name.trim());
  }
  if (patch.tokenName !== undefined) {
    if (patch.tokenName === null || patch.tokenName === '') push('token_name', null);
    else if (typeof patch.tokenName === 'string') push('token_name', patch.tokenName.trim());
    else throw badRequest('tokenName invalid');
  }
  if (!omitEntryToLow && patch.entryToLowMinutes !== undefined) {
    if (patch.entryToLowMinutes === null) push('entry_to_low_minutes', null);
    else if (typeof patch.entryToLowMinutes === 'number' && Number.isFinite(patch.entryToLowMinutes))
      push('entry_to_low_minutes', patch.entryToLowMinutes);
    else throw badRequest('entryToLowMinutes must be a finite number or null');
  }

  if (clauses.length === 0) throw badRequest('No valid fields to update');
  return { clauses, values };
}

/**
 * Update partiel d'un token. Gère le repli si la colonne `entry_to_low_minutes`
 * n'existe pas encore en base (renvoie alors un `warning`).
 */
export async function updateRuggerToken(
  ruggerId: string,
  tokenId: string,
  patch: RuggerTokenPatch
): Promise<{ updated: boolean; warning?: string }> {
  const run = async (omit: boolean): Promise<boolean> => {
    const { clauses, values } = buildTokenPatchParts(patch, omit);
    const rows = await query<{ id: string }>(
      `update rugger_tokens set ${clauses.join(', ')} where id = $${values.length + 1} and rugger_id = $${values.length + 2} returning id`,
      [...values, tokenId, ruggerId]
    );
    return rows.length > 0;
  };

  try {
    return { updated: await run(false) };
  } catch (e) {
    if (!isMissingEntryToLowColumnError(e) || patch.entryToLowMinutes === undefined) throw e;
    const updated = await run(true);
    return {
      updated,
      warning:
        'Colonne entry_to_low_minutes absente : high/low mis à jour. Exécutez `npx prisma migrate dev` pour activer les métriques klines associées.',
    };
  }
}

export async function deleteToken(ruggerId: string, tokenId: string): Promise<void> {
  await query('delete from rugger_tokens where id = $1 and rugger_id = $2', [tokenId, ruggerId]);
}
