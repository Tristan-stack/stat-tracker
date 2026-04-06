/**
 * Fragments SQL partagés pour les agrégations rugger (liste + détail).
 */
export const RUGGER_TOKEN_COUNT_SQL =
  '(select count(*)::int from rugger_tokens t where t.rugger_id = r.id)';

export const RUGGER_AVG_MAX_GAIN_SQL =
  '(select coalesce(avg((t.high - t.entry_price) / nullif(t.entry_price, 0) * 100), 0) from rugger_tokens t where t.rugger_id = r.id)';

export const RUGGER_LIST_SELECT = `
  select
    r.id,
    r.name,
    r.description,
    r.wallet_address,
    r.wallet_type,
    r.volume_min,
    r.volume_max,
    r.start_hour,
    r.end_hour,
    r.notes,
    r.status_id,
    r.archived,
    r.created_at,
    ${RUGGER_TOKEN_COUNT_SQL} as token_count,
    ${RUGGER_AVG_MAX_GAIN_SQL} as avg_max_gain_percent
  from ruggers r`;

/** Métriques token pour un rugger unique (alias `ruggers` dans update returning). */
export const RUGGER_METRICS_RETURNING = `
  (select count(*)::int from rugger_tokens t where t.rugger_id = ruggers.id) as token_count,
  (select coalesce(avg((t.high - t.entry_price) / nullif(t.entry_price, 0) * 100), 0) from rugger_tokens t where t.rugger_id = ruggers.id) as avg_max_gain_percent`;
