import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { mtprotoSessionConnected } from '@/lib/rugger-telegram/mtproto-login-service';

export const GET = withAuth(async (_req, _ctx, { userId }) => {
  const status = await mtprotoSessionConnected(userId);
  return NextResponse.json({
    connected: status.connected,
    ...(status.phoneHint !== undefined ? { phoneHint: status.phoneHint } : {}),
  });
});
