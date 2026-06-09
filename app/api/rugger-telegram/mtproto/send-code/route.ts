import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { parseBody } from '@/lib/api/validate';
import { TelegramConfigError } from '@/lib/telegram/client';
import { normalizePhoneE164 } from '@/lib/rugger-telegram/mtproto-phone';
import { mtprotoLoginSendCode } from '@/lib/rugger-telegram/mtproto-login-service';

export const runtime = 'nodejs';

export const POST = withAuth(async (req, _ctx, { userId }) => {
  const body = await parseBody(req, z.object({ phone: z.string().optional() }));
  const phone = normalizePhoneE164(body.phone?.trim() ?? '');
  if (!phone) {
    return NextResponse.json({ error: 'Numéro invalide.', code: 'invalid_phone' }, { status: 400 });
  }

  try {
    const result = await mtprotoLoginSendCode(userId, phone);
    if (!result.ok) {
      return NextResponse.json({ error: result.clientMessage, code: result.code }, { status: result.httpStatus });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TelegramConfigError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error('[rugger-telegram/mtproto/send-code]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Impossible de contacter Telegram.', code: 'internal_error' }, { status: 502 });
  }
});
