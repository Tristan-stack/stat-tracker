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

export function isPublicPagePath(pathname: string): boolean {
  return PUBLIC_PAGE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
