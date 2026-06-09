import type { ZodType } from 'zod';
import { ApiError } from '@/lib/api/errors';

function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const first = error.issues[0];
  if (!first) return 'Données invalides';
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

/** Parse + valide le corps JSON d'une requête. Lève `ApiError(400)` si invalide. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, 'Corps JSON invalide');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(400, formatIssues(result.error));
  }
  return result.data;
}

/** Parse + valide les query params. Lève `ApiError(400)` si invalide. */
export function parseQuery<T>(searchParams: URLSearchParams, schema: ZodType<T>): T {
  const obj: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) obj[key] = value;
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new ApiError(400, formatIssues(result.error));
  }
  return result.data;
}
