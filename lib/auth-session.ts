/**
 * Session serveur pour les Route Handlers (better-auth).
 * Requiert `BETTER_AUTH_URL` / `DATABASE_URL` alignés avec `lib/auth.ts`.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function getSessionFromRequest(req: NextRequest) {
  return auth.api.getSession({ headers: req.headers });
}

export async function requireUser(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const userId = session?.user?.id;
  if (!userId) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { userId };
}
