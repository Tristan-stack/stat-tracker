import { MTPROTO_COUNTRY_DIALS } from '@/lib/rugger-telegram/mtproto-country-dials';

const E164_PLUS = /^\+[1-9]\d{6,14}$/;

export function normalizePhoneE164(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, '');
  if (!trimmed) return null;
  const withPlus =
    trimmed.startsWith('+')
      ? trimmed
      : `+${trimmed.replace(/^\+/, '').replace(/^0+/, '')}`;
  const digits = `+${withPlus.slice(1).replace(/\D/g, '')}`;
  if (!E164_PLUS.test(digits)) return null;
  return digits;
}

/**
 * Compose un E.164 à partir de l’indicatif pays et du reste du numéro.
 * Si la zone « national » commence par `+`, elle est traitée comme un numéro complet (saisie avancée).
 */
export function composeE164FromIsoAndNational(iso2: string, nationalRaw: string): string | null {
  const trimmedNational = nationalRaw.trim().replace(/\s+/g, '');
  if (trimmedNational.startsWith('+')) return normalizePhoneE164(trimmedNational);

  const country = MTPROTO_COUNTRY_DIALS.find((c) => c.iso2 === iso2);
  const dial = country?.dial ?? '+33';
  if (!dial.startsWith('+')) return null;

  let nsn = nationalRaw.replace(/\D/g, '');
  if (!nsn) return null;
  if (nsn.startsWith('0') && nsn.length > 1) nsn = nsn.replace(/^0+/, '');
  if (!nsn) return null;

  return normalizePhoneE164(`${dial}${nsn}`);
}

/** Affichage non sensible (ex. `***7890`). */
export function maskedPhoneHint(phoneE164: string): string {
  const d = phoneE164.replace(/\D/g, '');
  const last = d.slice(-4);
  return last.length > 0 ? `***${last}` : '***';
}
