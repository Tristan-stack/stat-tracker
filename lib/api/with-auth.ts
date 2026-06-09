import type { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { toErrorResponse, type DbErrorMessages } from '@/lib/api/errors';

export interface AuthContext {
  userId: string;
}

// `Response` (pas seulement `NextResponse`) pour autoriser les réponses
// streaming (NDJSON) tout en acceptant les helpers `ok`/`created`.
type AuthedHandler<Ctx> = (
  req: NextRequest,
  ctx: Ctx,
  auth: AuthContext
) => Promise<Response> | Response;

interface WithAuthOptions {
  /** Étiquette de log pour les 500 inattendus (ex. "POST /api/ruggers"). */
  name?: string;
  /** Messages 409/400 personnalisés selon les contraintes d'unicité. */
  dbErrors?: DbErrorMessages;
}

/**
 * Enveloppe un route handler : exige une session (401 sinon), injecte `{ userId }`,
 * et convertit toute erreur levée (ApiError, codes Postgres, …) en réponse HTTP
 * via `toErrorResponse`. Supporte les routes statiques et dynamiques (`ctx.params`).
 */
export function withAuth<Ctx = unknown>(
  handler: AuthedHandler<Ctx>,
  opts?: WithAuthOptions
) {
  return async (req: NextRequest, ctx: Ctx) => {
    const auth = await requireUser(req);
    if ('response' in auth) return auth.response;
    const { userId } = auth;
    try {
      return await handler(req, ctx, { userId });
    } catch (e) {
      return toErrorResponse(e, opts?.name, opts?.dbErrors);
    }
  };
}
