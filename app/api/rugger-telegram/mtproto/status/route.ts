import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { mtprotoSessionConnected } from '@/lib/rugger-telegram/mtproto-login-service';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const status = await mtprotoSessionConnected(userId);
  return NextResponse.json({
    connected: status.connected,
    ...(status.phoneHint !== undefined ? { phoneHint: status.phoneHint } : {}),
  });
}
