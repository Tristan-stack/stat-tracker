/**
 * Seuil sur le champ « plus haut » (même unité que `Token.high`) pour le badge migration.
 * Valeur par défaut 34 (ex. 34M si tes montants sont en millions).
 */
export const MIGRATION_MCAP_THRESHOLD = 34;

export type MigrationView = 'all' | 'migrations';

export function isMigrationPeakMcap(high: number): boolean {
  return high >= MIGRATION_MCAP_THRESHOLD;
}
