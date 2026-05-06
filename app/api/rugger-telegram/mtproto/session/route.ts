import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { mtprotoDeleteLoginAndSession } from '@/lib/rugger-telegram/mtproto-login-service';

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  await mtprotoDeleteLoginAndSession(userId);
  return NextResponse.json({ ok: true });
}
