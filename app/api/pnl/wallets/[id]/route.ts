import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { deletePnlWallet, updatePnlWallet } from '@/lib/repositories/pnl-wallets';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const body = (await req.json()) as { label?: string };
  const label = body.label?.trim() || null;

  const wallet = await updatePnlWallet({ id, userId: auth.userId, label });
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet introuvable' }, { status: 404 });
  }
  return NextResponse.json({ wallet });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  const deleted = await deletePnlWallet({ id, userId: auth.userId });
  if (!deleted) {
    return NextResponse.json({ error: 'Wallet introuvable' }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
