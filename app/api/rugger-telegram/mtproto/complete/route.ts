import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { TelegramConfigError } from '@/lib/telegram/client';
import { mtprotoLoginComplete } from '@/lib/rugger-telegram/mtproto-login-service';

export const runtime = 'nodejs';

type Body = { code?: string; password?: string };

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = body.code?.trim() ?? '';
  if (!code) {
    return NextResponse.json({ error: 'Code obligatoire.', code: 'code_required' }, { status: 400 });
  }

  try {
    const result = await mtprotoLoginComplete(
      userId,
      code,
      typeof body.password === 'string' ? body.password : undefined
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.clientMessage, code: result.code },
        { status: result.httpStatus }
      );
    }
    return NextResponse.json({
      ok: true,
      phoneHint: result.phoneHint,
    });
  } catch (err) {
    if (err instanceof TelegramConfigError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rugger-telegram/mtproto/complete]', message);
    return NextResponse.json(
      { error: 'Connexion Telegram interrompue.', code: 'internal_error' },
      { status: 502 }
    );
  }
}
