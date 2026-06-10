/**
 * Pages sans session requise (proxy) et sans barre latérale (layout).
 * Une seule source de vérité pour éviter la dérive entre `proxy.ts` et le layout.
 */
const PUBLIC_PAGE_PATHS = [
  '/sign-in',
  '/sign-up',
  '/401',
  '/403',
  '/404',
  '/405',
] as const;

/**
 * Routes publiques à correspondance EXACTE uniquement (pas de préfixe).
 * La landing « / » en fait partie : un match par préfixe rendrait tout le site public.
 */
const PUBLIC_EXACT_PATHS = ['/'] as const;

export function isPublicPagePath(pathname: string): boolean {
  if (PUBLIC_EXACT_PATHS.some((p) => pathname === p)) return true;
  return PUBLIC_PAGE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
