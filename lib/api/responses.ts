import { NextResponse } from 'next/server';

/**
 * Helpers de réponse succès. La route reste maîtresse de la forme de son
 * payload (ex. `ok({ wallets })`, `ok(rugger)`) ; les erreurs passent par
 * `lib/api/errors.ts` (forme `{ error }`).
 *
 * Point de centralisation unique : une future standardisation d'enveloppe
 * (`{ data }`) se ferait ici + dans `lib/api-client.ts` sans toucher les routes.
 */
export function ok<T>(payload: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(payload, init);
}

export function created<T>(payload: T): NextResponse {
  return NextResponse.json(payload, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
