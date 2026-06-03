import { getRawTransaction, type RawInstruction } from '@/lib/helius/client';
import { AddressTracerParseError, type TracerStrategy } from './types';

export const SEVEN_SRSW_DECOY = '7SrswG4bFtgSoPJCfJs2WFKbuDevid396HjeA4YN8XFB';

/**
 * Mapping positions UI (1-based, ex. Solscan) ↔ indices array `accounts[]` (0-based) :
 *  - accounts[0] = #1 = signer / fee payer
 *  - accounts[1] = #2 = VRAI destinataire
 *  - accounts[2] = #3 = 7Srsw (leurre à détecter)
 *  - accounts[3] = #4 = System Program
 */
const DECOY_ACCOUNT_INDEX = 2;
const REAL_RECIPIENT_ACCOUNT_INDEX = 1;

function isUnknownInstruction(ix: RawInstruction): boolean {
  // Les programmes parsés (System Program, Token Program, etc.) exposent
  // un champ `parsed`. Le programme custom 7Srsw n'en a pas.
  return ix.parsed === undefined;
}

function instructionTrapsSevenSrsw(ix: RawInstruction): boolean {
  if (!isUnknownInstruction(ix)) return false;
  if (!Array.isArray(ix.accounts) || ix.accounts.length <= DECOY_ACCOUNT_INDEX) return false;
  return ix.accounts[DECOY_ACCOUNT_INDEX] === SEVEN_SRSW_DECOY;
}

export const sevenSrswTracer: TracerStrategy = {
  id: '7srsw',
  label: '7Srsw',
  async resolveRealRecipient(apparentRecipient, signature) {
    if (apparentRecipient !== SEVEN_SRSW_DECOY) {
      return { recipient: apparentRecipient, deobfuscated: false };
    }

    const tx = await getRawTransaction(signature);

    const topLevel = tx.transaction?.message?.instructions ?? [];
    const inner = tx.meta?.innerInstructions ?? [];

    const all: RawInstruction[] = [
      ...topLevel,
      ...inner.flatMap((group) => group.instructions ?? []),
    ];

    const trap = all.find(instructionTrapsSevenSrsw);
    if (!trap) {
      throw new AddressTracerParseError(
        `Impossible de localiser l'instruction 7Srsw dans la transaction ${signature}.`
      );
    }

    const realRecipient = trap.accounts[REAL_RECIPIENT_ACCOUNT_INDEX];
    if (typeof realRecipient !== 'string' || realRecipient === '') {
      throw new AddressTracerParseError(
        `Instruction 7Srsw trouvée mais le compte #${REAL_RECIPIENT_ACCOUNT_INDEX + 1} est manquant (signature ${signature}).`
      );
    }

    return { recipient: realRecipient, deobfuscated: true, variant: '7srsw' };
  },
};
