import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/with-auth';
import { mtprotoDeleteLoginAndSession } from '@/lib/rugger-telegram/mtproto-login-service';

export const DELETE = withAuth(async (_req, _ctx, { userId }) => {
  await mtprotoDeleteLoginAndSession(userId);
  return NextResponse.json({ ok: true });
});
