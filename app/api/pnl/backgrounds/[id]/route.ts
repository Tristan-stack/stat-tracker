import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { deletePnlBackground, getPnlBackground } from '@/lib/repositories/pnl-backgrounds';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const background = await getPnlBackground({ id, userId: auth.userId });
  if (!background) {
    return NextResponse.json({ error: 'Fond introuvable' }, { status: 404 });
  }
  return NextResponse.json({ background });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const deleted = await deletePnlBackground({ id, userId: auth.userId });
  if (!deleted) {
    return NextResponse.json({ error: 'Fond introuvable' }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
