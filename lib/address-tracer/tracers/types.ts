import type { TracerType } from '@/types/address-trace';

export interface TracerResolution {
  recipient: string;
  deobfuscated: boolean;
  /**
   * Variante de leurre réellement déjouée (renseignée seulement si `deobfuscated`).
   * Permet de distinguer V1 vs V2 quand le tracer V2 (sur-ensemble) résout un ancien
   * leurre 7Srsw.
   */
  variant?: TracerType;
}

export interface TracerStrategy {
  id: TracerType;
  label: string;
  /**
   * Renvoie le vrai destinataire d'un transfert.
   * - Si `apparentRecipient` n'est pas un leurre connu, renvoie l'adresse inchangée
   *   avec `deobfuscated: false`.
   * - Sinon, lit la transaction brute via Helius RPC et applique la règle positionnelle
   *   de la stratégie pour retrouver le vrai destinataire.
   */
  resolveRealRecipient(apparentRecipient: string, signature: string): Promise<TracerResolution>;
}

export class AddressTracerParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AddressTracerParseError';
  }
}
