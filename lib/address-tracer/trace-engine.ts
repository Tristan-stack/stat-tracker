import {
  getEnhancedTransactionsByAddress,
  getRawTransaction,
  LAMPORTS_PER_SOL,
  type HeliusEnhancedTransaction,
  type HeliusNativeTransfer,
  type RawTransaction,
} from '@/lib/helius/client';
import {
  isKnownExchange,
  NOISY_WALLET_THRESHOLD,
} from '@/lib/helius/exchange-addresses';
import type {
  AddressTraceHop,
  AddressTraceStoppedBy,
  TracerType,
} from '@/types/address-trace';
import { extractSolOutflowsFromRaw } from './extract-sol-outflows';
import type { TracerStrategy } from './tracers/types';

export const DEFAULT_ADDRESS_TRACER_MAX_DEPTH = 30;

export function resolveMaxDepth(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return Math.floor(override);
  }
  const envValue = Number(process.env.ADDRESS_TRACER_MAX_DEPTH ?? '');
  if (Number.isFinite(envValue) && envValue > 0) {
    return Math.floor(envValue);
  }
  return DEFAULT_ADDRESS_TRACER_MAX_DEPTH;
}

interface MatchedTransfer {
  to: string;
  amountLamports: number;
  signature: string;
  timestamp: number;
}

interface ExtractOutgoingResult {
  count: number;
  matches: MatchedTransfer[];
}

/**
 * Extrait les transferts SOL sortants depuis `address`.
 *
 * Fast path : `nativeTransfers` du parsing enrichi Helius (couvre les
 * `SystemProgram::Transfer` classiques).
 *
 * Fallback : pour les tx où Helius ne reporte AUCUN mouvement natif impliquant
 * `address` (ni entrant ni sortant), on télécharge la tx brute et on cherche
 * des `createAccount` / `createAccountWithSeed` / `transferWithSeed`
 * (System Program) ou `closeAccount` (Token Program / Token-2022) où `address`
 * est source / compte fermé. Ce cas couvre les patterns :
 *  - `createAccountWithSeed` qui débite plusieurs SOL sans être listé dans
 *    `nativeTransfers`.
 *  - `closeAccount` éphémère où `address` est lui-même le token account fermé
 *    (typique d'obfuscation 7Srsw : create puis close dans la même tx, lamports
 *    envoyés au vrai destinataire).
 *
 * Optim : on saute la raw-tx si la tx a au moins un `nativeTransfer` entrant
 * vers `address` (typiquement une tx d'inflow pure → pas d'outflow à chercher).
 *
 * Renvoie aussi le `count` brut (après filtre temporel, avant fenêtre lamports)
 * pour la détection « noisy ».
 */
async function extractOutgoingMatches(
  txs: HeliusEnhancedTransaction[],
  address: string,
  sinceTimestamp: number | null,
  minLamports: number,
  maxLamports: number,
  fetchRawTx: (signature: string) => Promise<RawTransaction>
): Promise<ExtractOutgoingResult> {
  let count = 0;
  const matches: MatchedTransfer[] = [];

  for (const tx of txs) {
    if (sinceTimestamp !== null && tx.timestamp < sinceTimestamp) continue;

    const nativeOutflows: Array<{ to: string; amount: number }> = [];
    let hasNativeInflow = false;

    if (Array.isArray(tx.nativeTransfers)) {
      for (const nt of tx.nativeTransfers as HeliusNativeTransfer[]) {
        if (nt.amount <= 0) continue;
        if (nt.fromUserAccount === address && nt.toUserAccount !== address) {
          nativeOutflows.push({ to: nt.toUserAccount, amount: nt.amount });
        } else if (nt.toUserAccount === address && nt.fromUserAccount !== address) {
          hasNativeInflow = true;
        }
      }
    }

    if (nativeOutflows.length > 0) {
      for (const out of nativeOutflows) {
        count += 1;
        if (out.amount < minLamports || out.amount > maxLamports) continue;
        matches.push({
          to: out.to,
          amountLamports: out.amount,
          signature: tx.signature,
          timestamp: tx.timestamp,
        });
      }
      continue;
    }

    // Inflow pur (au moins un transfert SOL entrant et zéro sortant) :
    // pas d'outflow à chercher dans les instructions parsées.
    if (hasNativeInflow) continue;

    let raw: RawTransaction;
    try {
      raw = await fetchRawTx(tx.signature);
    } catch {
      continue;
    }

    const outflows = extractSolOutflowsFromRaw(raw, address);
    for (const out of outflows) {
      count += 1;
      if (out.amountLamports < minLamports || out.amountLamports > maxLamports) continue;
      matches.push({
        to: out.to,
        amountLamports: out.amountLamports,
        signature: tx.signature,
        timestamp: tx.timestamp,
      });
    }
  }

  return { count, matches };
}

export interface StepOpts {
  currentAddress: string;
  visited: Set<string>;
  minLamports: number;
  maxLamports: number;
  tracer: TracerStrategy;
  /** Timestamp (unix s) du tx d'entrée. `null` pour le start (pas de filtre temporel). */
  sinceTimestamp: number | null;
  depthReached: number;
  maxDepth: number;
  tracerType: TracerType;
  /** Override pour les tests : downloader de transaction brute. */
  fetchRawTx?: (signature: string) => Promise<RawTransaction>;
}

export type StepResult =
  | {
      kind: 'auto';
      hop: AddressTraceHop;
      nextSinceTimestamp: number;
    }
  | {
      kind: 'stop';
      stoppedBy: AddressTraceStoppedBy;
    };

/**
 * Exécute UNE étape de parcours depuis `currentAddress`. Renvoie :
 *  - `auto` quand au moins un transfert sortant match la fenêtre. On prend
 *    TOUJOURS le plus récent en date (peu importe la destination), on applique
 *    la résolution 7Srsw si nécessaire, puis on vérifie les garde-fous.
 *  - `stop` si un garde-fou s'est déclenché (no_match / exchange / noisy / circular / depth).
 */
export async function stepAddress(opts: StepOpts): Promise<StepResult> {
  const {
    currentAddress,
    visited,
    minLamports,
    maxLamports,
    tracer,
    sinceTimestamp,
    depthReached,
    maxDepth,
    tracerType,
    fetchRawTx = getRawTransaction,
  } = opts;

  if (depthReached >= maxDepth) {
    return { kind: 'stop', stoppedBy: 'depth' };
  }

  const txs = await getEnhancedTransactionsByAddress(currentAddress);
  const { count, matches } = await extractOutgoingMatches(
    txs,
    currentAddress,
    sinceTimestamp,
    minLamports,
    maxLamports,
    fetchRawTx
  );

  if (count > NOISY_WALLET_THRESHOLD) {
    return { kind: 'stop', stoppedBy: 'noisy' };
  }

  if (matches.length === 0) {
    return { kind: 'stop', stoppedBy: 'no_match' };
  }

  // Règle : toujours suivre le transfert le plus récent en date, toutes
  // destinations confondues. Couvre les cas de boucles (mêmes destinations
  // multiples) ET de split vers plusieurs destinations distinctes (dont le
  // leurre 7Srsw, géré ensuite par `resolveRealRecipient`).
  const latest = matches.reduce((a, b) => (b.timestamp > a.timestamp ? b : a));

  const { recipient, deobfuscated, variant } = await tracer.resolveRealRecipient(latest.to, latest.signature);

  if (isKnownExchange(recipient)) {
    return { kind: 'stop', stoppedBy: 'exchange' };
  }
  if (visited.has(recipient)) {
    return { kind: 'stop', stoppedBy: 'circular' };
  }

  const hop: AddressTraceHop = {
    index: depthReached + 1,
    from: currentAddress,
    to: recipient,
    apparentTo: latest.to,
    solAmount: latest.amountLamports / LAMPORTS_PER_SOL,
    signature: latest.signature,
    timestamp: latest.timestamp,
    deobfuscated,
    deobfuscatedVariant: variant,
    tracerType,
  };

  return { kind: 'auto', hop, nextSinceTimestamp: latest.timestamp };
}
