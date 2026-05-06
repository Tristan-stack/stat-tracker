/** Pays courants pour le login Telegram (indicatif E.164). */
export type MtprotoCountryDial = {
  iso2: string;
  nameFr: string;
  dial: string;
};

/** Drapeau régional Unicode à partir du code ISO 3166-1 alpha-2. */
export function iso2ToFlagEmoji(iso2: string): string {
  const u = iso2.toUpperCase();
  if (u.length !== 2 || !/^[A-Z]{2}$/.test(u)) return '🌐';
  const base = 0x1f1e6;
  const letterA = 0x41;
  return String.fromCodePoint(
    base + (u.charCodeAt(0) - letterA),
    base + (u.charCodeAt(1) - letterA)
  );
}

const _MTPROTO_COUNTRY_DIALS_UNSORTED: MtprotoCountryDial[] = [
  { iso2: 'FR', nameFr: 'France', dial: '+33' },
  { iso2: 'BE', nameFr: 'Belgique', dial: '+32' },
  { iso2: 'CH', nameFr: 'Suisse', dial: '+41' },
  { iso2: 'LU', nameFr: 'Luxembourg', dial: '+352' },
  { iso2: 'MC', nameFr: 'Monaco', dial: '+377' },
  { iso2: 'CA', nameFr: 'Canada', dial: '+1' },
  { iso2: 'US', nameFr: 'États-Unis', dial: '+1' },
  { iso2: 'GB', nameFr: 'Royaume-Uni', dial: '+44' },
  { iso2: 'DE', nameFr: 'Allemagne', dial: '+49' },
  { iso2: 'ES', nameFr: 'Espagne', dial: '+34' },
  { iso2: 'IT', nameFr: 'Italie', dial: '+39' },
  { iso2: 'PT', nameFr: 'Portugal', dial: '+351' },
  { iso2: 'NL', nameFr: 'Pays-Bas', dial: '+31' },
  { iso2: 'AT', nameFr: 'Autriche', dial: '+43' },
  { iso2: 'IE', nameFr: 'Irlande', dial: '+353' },
  { iso2: 'SE', nameFr: 'Suède', dial: '+46' },
  { iso2: 'NO', nameFr: 'Norvège', dial: '+47' },
  { iso2: 'DK', nameFr: 'Danemark', dial: '+45' },
  { iso2: 'FI', nameFr: 'Finlande', dial: '+358' },
  { iso2: 'PL', nameFr: 'Pologne', dial: '+48' },
  { iso2: 'CZ', nameFr: 'Tchéquie', dial: '+420' },
  { iso2: 'RO', nameFr: 'Roumanie', dial: '+40' },
  { iso2: 'GR', nameFr: 'Grèce', dial: '+30' },
  { iso2: 'TR', nameFr: 'Turquie', dial: '+90' },
  { iso2: 'MA', nameFr: 'Maroc', dial: '+212' },
  { iso2: 'DZ', nameFr: 'Algérie', dial: '+213' },
  { iso2: 'TN', nameFr: 'Tunisie', dial: '+216' },
  { iso2: 'SN', nameFr: 'Sénégal', dial: '+221' },
  { iso2: 'CI', nameFr: "Côte d'Ivoire", dial: '+225' },
  { iso2: 'RE', nameFr: 'La Réunion', dial: '+262' },
  { iso2: 'GP', nameFr: 'Guadeloupe', dial: '+590' },
  { iso2: 'MQ', nameFr: 'Martinique', dial: '+596' },
  { iso2: 'GF', nameFr: 'Guyane', dial: '+594' },
  { iso2: 'BR', nameFr: 'Brésil', dial: '+55' },
  { iso2: 'AR', nameFr: 'Argentine', dial: '+54' },
  { iso2: 'MX', nameFr: 'Mexique', dial: '+52' },
  { iso2: 'IN', nameFr: 'Inde', dial: '+91' },
  { iso2: 'JP', nameFr: 'Japon', dial: '+81' },
  { iso2: 'KR', nameFr: 'Corée du Sud', dial: '+82' },
  { iso2: 'AU', nameFr: 'Australie', dial: '+61' },
  { iso2: 'NZ', nameFr: 'Nouvelle-Zélande', dial: '+64' },
  { iso2: 'AE', nameFr: 'Émirats arabes unis', dial: '+971' },
  { iso2: 'IL', nameFr: 'Israël', dial: '+972' },
];

/** France en tête, puis ordre alphabétique français. */
export const MTPROTO_COUNTRY_DIALS: readonly MtprotoCountryDial[] = (() => {
  const fr = _MTPROTO_COUNTRY_DIALS_UNSORTED.filter((c) => c.iso2 === 'FR');
  const rest = _MTPROTO_COUNTRY_DIALS_UNSORTED
    .filter((c) => c.iso2 !== 'FR')
    .sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr'));
  return [...fr, ...rest];
})();
