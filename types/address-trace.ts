export type TracerType = '7srsw' | '7srsw-v2';

export type AddressTraceStoppedBy =
  | 'completed'
  | 'depth'
  | 'exchange'
  | 'noisy'
  | 'no_match'
  | 'circular';

export interface AddressTraceHop {
  index: number;
  from: string;
  to: string;
  /** Destinataire apparent (avant résolution 7Srsw). Égal à `to` si pas de déjouage. */
  apparentTo: string;
  solAmount: number;
  signature: string;
  /** Unix seconds, depuis Helius/Solana. */
  timestamp: number;
  deobfuscated: boolean;
  /** Variante de leurre déjouée pour ce saut (V1 vs V2). Absente si pas de déjouage. */
  deobfuscatedVariant?: TracerType;
  tracerType: TracerType;
  /** Nombre de tokens fongibles dont `to` est crédité comme créateur on-chain (DAS). */
  toCreatorCount?: number;
}

export interface AddressTraceCandidate {
  to: string;
  apparentTo: string;
  solAmount: number;
  signature: string;
  timestamp: number;
  deobfuscated: boolean;
}

export interface AddressTraceResult {
  startAddress: string;
  tracerType: TracerType;
  minSol: number;
  maxSol: number;
  hops: AddressTraceHop[];
  stoppedBy: AddressTraceStoppedBy;
  resolvedAt: string;
}
