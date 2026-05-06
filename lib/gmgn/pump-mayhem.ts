import { gmgnGet } from '@/lib/gmgn/client';

const CHAIN_SOL = 'sol';

/** Clés GMGN où une valeur type `pump_mayhem` / `pump_mayhem_agent` apparaît. */
const PLATFORMISH_KEY = /launchpad|platform|exchange|dex|pool|curve|bonding/i;

function stringIndicatesPumpMayhem(s: string): boolean {
  const t = s.toLowerCase().trim();
  if (t === '') return false;
  return t.includes('pump_mayhem') || t.includes('mayhem_agent');
}

/**
 * Détecte un token lancé sur la plateforme Pump « Mayhem » d’après une réponse GMGN `token/info` (ou équivalent).
 * On ne balaie pas toutes les chaînes du JSON pour éviter les faux positifs (ex. texte utilisateur).
 */
export function gmgnPayloadIndicatesPumpMayhem(payload: unknown): boolean {
  const visit = (node: unknown, depth: number): boolean => {
    if (depth > 14 || node === null || node === undefined) return false;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (visit(item, depth + 1)) return true;
      }
      return false;
    }
    if (typeof node !== 'object') return false;
    const rec = node as Record<string, unknown>;
    for (const [key, val] of Object.entries(rec)) {
      if (typeof val === 'string' && PLATFORMISH_KEY.test(key) && stringIndicatesPumpMayhem(val)) return true;
      if (val && typeof val === 'object') {
        if (visit(val, depth + 1)) return true;
      }
    }
    return false;
  };
  return visit(payload, 0);
}

export type GmgnPumpMayhemProbe =
  | { kind: 'classified'; isPumpMayhem: boolean }
  | { kind: 'unavailable' };

/**
 * Appelle GMGN jusqu’à obtenir une réponse exploitable.
 * `unavailable` : aucun endpoint n’a répondu avec succès (ne doit pas être mis en cache).
 */
export async function probeGmgnPumpMayhemMint(mint: string): Promise<GmgnPumpMayhemProbe> {
  const attempts: Array<{ path: string; query: Record<string, string> }> = [
    { path: '/v1/token/info', query: { chain: CHAIN_SOL, address: mint } },
    { path: '/v1/token/info', query: { chain: CHAIN_SOL, token_address: mint } },
    { path: '/v1/token/price_info', query: { chain: CHAIN_SOL, address: mint } },
    { path: '/v1/token/stat', query: { chain: CHAIN_SOL, address: mint } },
  ];

  for (const a of attempts) {
    try {
      const payload = await gmgnGet<unknown>(a.path, a.query);
      if (gmgnPayloadIndicatesPumpMayhem(payload))
        return { kind: 'classified', isPumpMayhem: true };
      // Réponse valide mais pas mayhem : ne pas essayer d’autres endpoints (économise le quota).
      return { kind: 'classified', isPumpMayhem: false };
    } catch {
      // Essai suivant.
    }
  }
  return { kind: 'unavailable' };
}

/**
 * Interroge GMGN pour savoir si le mint est associé à Pump Mayhem.
 * En cas d’échec API (tous les essais), retourne `false` : le token reste affiché.
 */
export async function fetchGmgnPumpMayhemMint(mint: string): Promise<boolean> {
  const p = await probeGmgnPumpMayhemMint(mint);
  if (p.kind === 'unavailable') return false;
  return p.isPumpMayhem;
}
