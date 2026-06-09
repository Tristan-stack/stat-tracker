import { NextResponse } from 'next/server';
import { getPostgresErrorCode } from '@/lib/pg-errors';

/**
 * Erreur applicative à lever depuis un handler/validation : `withAuth` la
 * convertit automatiquement en réponse HTTP (status + message).
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message = 'Invalid request') => new ApiError(400, message);
export const notFoundError = (message = 'Not found') => new ApiError(404, message);
export const conflictError = (message: string) => new ApiError(409, message);

/** Messages 409 personnalisables selon le contexte d'unicité de la route. */
export interface DbErrorMessages {
  /** Violation de contrainte unique (23505). */
  conflict?: string;
  /** Violation de clé étrangère (23503). */
  foreignKey?: string;
}

/**
 * Convertit n'importe quelle erreur en réponse HTTP : `ApiError` → status porté,
 * codes Postgres connus → 409/400, défaut → 500 (loggé avec le contexte).
 */
export function toErrorResponse(
  error: unknown,
  ctx?: string,
  messages?: DbErrorMessages
): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const code = getPostgresErrorCode(error);
  if (code === '23505') {
    return NextResponse.json(
      { error: messages?.conflict ?? 'Cette ressource existe déjà.' },
      { status: 409 }
    );
  }
  if (code === '23503') {
    return NextResponse.json(
      { error: messages?.foreignKey ?? 'Référence invalide.' },
      { status: 400 }
    );
  }

  console.error(`[${ctx ?? 'api'}]`, error);
  return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
}
