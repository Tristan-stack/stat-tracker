import { getRawTransaction, type RawInstruction } from '@/lib/helius/client';
import { AddressTracerParseError, type TracerStrategy } from './types';

/**
 * Programmes leurres « 7Srsw V2 ». Le motif d'obfuscation a évolué : le leurre
 * n'est plus une adresse destinataire fixe (cf. 7Srsw V1) mais un PROGRAME custom
 * invoqué par une instruction « Unknown ». Liste extensible — le programme a déjà
 * changé une fois et rechangera.
 */
export const SEVEN_SRSW_V2_DECOY_PROGRAMS = ['9ddjzqYhSTMHaBrrKukRXRfy4WzHUPjdX88uPXZ7MXyn'];

/**
 * Layout observé de l'instruction piège V2 (la « #3 Unknown » sur Solscan) :
 *  - accounts[0] = #1 = fee payer / signer
 *  - accounts[1] = #2 = signer
 *  - accounts[2] = #3 = VRAI destinataire
 *  - accounts[3] = #4 = System Program
 */
const REAL_RECIPIENT_V2_INDEX = 2;

function isUnknownInstruction(ix: RawInstruction): boolean {
  // Les programmes parsés (System Program, Token Program, etc.) exposent un
  // champ `parsed`. Le programme leurre V2 n'en a pas.
  return ix.parsed === undefined;
}

function instructionTrapsV2(ix: RawInstruction): boolean {
  if (!isUnknownInstruction(ix)) return false;
  if (!SEVEN_SRSW_V2_DECOY_PROGRAMS.includes(ix.programId)) return false;
  if (!Array.isArray(ix.accounts) || ix.accounts.length <= REAL_RECIPIENT_V2_INDEX) return false;
  return true;
}

export const sevenSrswV2Tracer: TracerStrategy = {
  id: '7srsw-v2',
  label: '7Srsw V2',
  async resolveRealRecipient(apparentRecipient, signature) {
    const tx = await getRawTransaction(signature);

    const topLevel = tx.transaction?.message?.instructions ?? [];
    const inner = tx.meta?.innerInstructions ?? [];

    // Top-level d'abord : la « #3 Unknown » de Solscan est une instruction de
    // premier niveau. On scanne aussi les inner instructions par robustesse.
    const all: RawInstruction[] = [
      ...topLevel,
      ...inner.flatMap((group) => group.instructions ?? []),
    ];

    const trap = all.find(instructionTrapsV2);

    // Contrairement à 7Srsw V1, V2 n'a pas d'adresse-leurre déclencheuse :
    // `resolveRealRecipient` est appelé sur CHAQUE tx suivie par le moteur. Si
    // la tx ne contient aucune instruction au programme leurre V2, ce n'est pas
    // une obfuscation V2 → pass-through (jamais de throw).
    //
    // Pour un futur tracer « sur-ensemble V1+V2 », cette branche pourrait
    // déléguer à `sevenSrswTracer.resolveRealRecipient(apparentRecipient, signature)`.
    if (!trap) {
      return { recipient: apparentRecipient, deobfuscated: false };
    }

    const realRecipient = trap.accounts[REAL_RECIPIENT_V2_INDEX];
    if (typeof realRecipient !== 'string' || realRecipient === '') {
      throw new AddressTracerParseError(
        `Instruction leurre 7Srsw V2 trouvée mais le compte #${REAL_RECIPIENT_V2_INDEX + 1} est manquant (signature ${signature}).`
      );
    }

    return { recipient: realRecipient, deobfuscated: true };
  },
};
