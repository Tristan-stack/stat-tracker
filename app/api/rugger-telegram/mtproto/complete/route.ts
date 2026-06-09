import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { parseBody } from '@/lib/api/validate';
import { TelegramConfigError } from '@/lib/telegram/client';
import { mtprotoLoginComplete } from '@/lib/rugger-telegram/mtproto-login-service';

export const runtime = 'nodejs';

export const POST = withAuth(async (req, _ctx, { userId }) => {
  const body = await parseBody(req, z.object({ code: z.string().optional(), password: z.string().optional() }));
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
      return NextResponse.json({ error: result.clientMessage, code: result.code }, { status: result.httpStatus });
    }
    return NextResponse.json({ ok: true, phoneHint: result.phoneHint });
  } catch (err) {
    if (err instanceof TelegramConfigError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error('[rugger-telegram/mtproto/complete]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Connexion Telegram interrompue.', code: 'internal_error' }, { status: 502 });
  }
});
