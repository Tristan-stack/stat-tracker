import type { RawInstruction, RawTransaction } from '@/lib/helius/client';

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SPL_TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export type SolOutflowKind = 'transfer' | 'createAccount' | 'closeAccount';

export interface SolOutflow {
  to: string;
  amountLamports: number;
  kind: SolOutflowKind;
}

interface ParsedShape {
  type?: unknown;
  info?: unknown;
}

function readParsed(ix: RawInstruction): { type: string; info: Record<string, unknown> } | null {
  if (!ix.parsed || typeof ix.parsed !== 'object') return null;
  const p = ix.parsed as ParsedShape;
  if (typeof p.type !== 'string') return null;
  const info = p.info && typeof p.info === 'object' ? (p.info as Record<string, unknown>) : {};
  return { type: p.type, info };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function asLamports(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function findCreateAccountLamports(instructions: RawInstruction[], newAccount: string): number {
  for (const ix of instructions) {
    if (ix.programId !== SYSTEM_PROGRAM_ID) continue;
    const parsed = readParsed(ix);
    if (!parsed) continue;
    if (parsed.type !== 'createAccount' && parsed.type !== 'createAccountWithSeed') continue;
    if (asString(parsed.info.newAccount) !== newAccount) continue;
    const lamports = asLamports(parsed.info.lamports);
    if (lamports > 0) return lamports;
  }
  return 0;
}

/**
 * Extrait les sorties SOL d'une transaction brute (jsonParsed) pour `address` :
 *
 * - System Program : `transfer`, `transferWithSeed`, `createAccount`, `createAccountWithSeed`
 *   (source === address, destination/newAccount ≠ address, lamports > 0).
 * - Token Program / Token-2022 : `closeAccount` quand `address` EST le compte fermé
 *   (info.account === address). Sémantique : les lamports détenus par le token account
 *   `address` partent à `info.destination`. Cas typique d'obfuscation 7Srsw : un
 *   `createAccountWithSeed` finance un compte éphémère, puis `closeAccount` envoie
 *   les lamports au vrai destinataire dans la même tx.
 *
 *   Montant lamports : `preBalances[index(account)]` (le solde du compte avant close).
 *   Si le compte vient d'être créé dans la même tx (preBalance = 0), on retombe sur
 *   le `lamports` du `createAccount` correspondant.
 *
 * Parcourt à la fois les instructions top-level et les inner instructions (CPIs).
 */
export function extractSolOutflowsFromRaw(
  raw: RawTransaction | null | undefined,
  address: string
): SolOutflow[] {
  const outflows: SolOutflow[] = [];
  if (!raw) return outflows;

  const topLevel = raw.transaction?.message?.instructions ?? [];
  const inner = raw.meta?.innerInstructions ?? [];
  const all: RawInstruction[] = [
    ...topLevel,
    ...inner.flatMap((group) => group.instructions ?? []),
  ];

  const accountKeys: string[] = (raw.transaction?.message?.accountKeys ?? []).map((k) =>
    typeof k === 'string' ? k : k.pubkey
  );
  const preBalances = raw.meta?.preBalances ?? [];

  for (const ix of all) {
    const parsed = readParsed(ix);
    if (!parsed) continue;

    if (ix.programId === SYSTEM_PROGRAM_ID) {
      const source = asString(parsed.info.source);
      if (source !== address) continue;

      const lamports = asLamports(parsed.info.lamports);
      if (lamports === 0) continue;

      if (parsed.type === 'transfer' || parsed.type === 'transferWithSeed') {
        const dest = asString(parsed.info.destination);
        if (!dest || dest === address) continue;
        outflows.push({ to: dest, amountLamports: lamports, kind: 'transfer' });
      } else if (parsed.type === 'createAccount' || parsed.type === 'createAccountWithSeed') {
        const newAccount = asString(parsed.info.newAccount);
        if (!newAccount || newAccount === address) continue;
        outflows.push({ to: newAccount, amountLamports: lamports, kind: 'createAccount' });
      }
      continue;
    }

    if (
      ix.programId === SPL_TOKEN_PROGRAM_ID ||
      ix.programId === SPL_TOKEN_2022_PROGRAM_ID
    ) {
      if (parsed.type !== 'closeAccount') continue;

      const closedAccount = asString(parsed.info.account);
      const dest = asString(parsed.info.destination);
      if (!closedAccount || !dest || dest === address) continue;
      if (closedAccount !== address) continue;

      const idx = accountKeys.indexOf(closedAccount);
      let lamports = idx >= 0 && idx < preBalances.length ? preBalances[idx] : 0;
      if (typeof lamports !== 'number' || !Number.isFinite(lamports) || lamports <= 0) {
        // Compte créé dans la même tx (preBalance = 0) → on déduit le montant
        // du createAccount/createAccountWithSeed correspondant.
        lamports = findCreateAccountLamports(all, closedAccount);
      }
      if (typeof lamports !== 'number' || !Number.isFinite(lamports) || lamports <= 0) continue;

      outflows.push({ to: dest, amountLamports: lamports, kind: 'closeAccount' });
    }
  }

  return outflows;
}
