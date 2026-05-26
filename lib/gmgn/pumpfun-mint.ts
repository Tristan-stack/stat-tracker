import { gmgnGet } from '@/lib/gmgn/client';

const CHAIN_SOL = 'sol';

/** Clés GMGN susceptibles de porter le launchpad du mint. */
const LAUNCHPAD_KEYS = /^(launchpad|launchpad_platform|platform)$/i;

const NON_PUMPFUN_LAUNCHPAD = /meteora|raydium|jupiter|moonshot|believe|orca|lifinity|phoenix|bonk_fun|letsbonk/i;

/**
 * Indique si une valeur GMGN décrit un lancement pump.fun (classique ou Mayhem).
 * Exclut explicitement Meteora, Raydium, etc.
 */
export function isPumpfunLaunchpadValue(value: string): boolean {
  const raw = value.toLowerCase().trim();
  if (raw === '') return false;
  if (NON_PUMPFUN_LAUNCHPAD.test(raw)) return false;

  const compact = raw.replace(/\s+/g, '').replace(/\./g, '').replace(/_/g, '');
  if (compact.includes('pumpmayhem')) return true;
  if (compact === 'pump' || compact === 'pumpfun' || compact.startsWith('pumpfun')) return true;
  if (compact.includes('pump_fun')) return true;
  if (raw.includes('pump.fun')) return true;

  return false;
}

/**
 * Parcourt une réponse GMGN `token/info` (ou équivalent) pour un launchpad pump.fun.
 */
export function gmgnPayloadIndicatesPumpfunMint(payload: unknown): boolean {
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
      if (typeof val === 'string' && LAUNCHPAD_KEYS.test(key) && isPumpfunLaunchpadValue(val)) {
        return true;
      }
      if (val && typeof val === 'object' && visit(val, depth + 1)) return true;
    }
    return false;
  };
  return visit(payload, 0);
}

export type GmgnPumpfunMintProbe =
  | { kind: 'classified'; isPumpfun: boolean }
  | { kind: 'unavailable' };

export async function probeGmgnPumpfunMint(mint: string): Promise<GmgnPumpfunMintProbe> {
  const attempts: Array<{ path: string; query: Record<string, string> }> = [
    { path: '/v1/token/info', query: { chain: CHAIN_SOL, address: mint } },
    { path: '/v1/token/info', query: { chain: CHAIN_SOL, token_address: mint } },
  ];

  for (const a of attempts) {
    try {
      const payload = await gmgnGet<unknown>(a.path, a.query);
      return { kind: 'classified', isPumpfun: gmgnPayloadIndicatesPumpfunMint(payload) };
    } catch {
      // Essai suivant.
    }
  }
  return { kind: 'unavailable' };
}

/** `false` si GMGN ne répond pas — on exclut les mints non classifiables. */
export async function isPumpfunMint(mint: string): Promise<boolean> {
  const probe = await probeGmgnPumpfunMint(mint);
  if (probe.kind === 'unavailable') return false;
  return probe.isPumpfun;
}
