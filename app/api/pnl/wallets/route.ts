import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { getPostgresErrorCode } from '@/lib/pg-errors';
import { insertPnlWallet, listPnlWallets } from '@/lib/repositories/pnl-wallets';

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const wallets = await listPnlWallets(auth.userId);
  return NextResponse.json({ wallets });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const body = (await req.json()) as { walletAddress?: string; label?: string };
  const walletAddress = body.walletAddress?.trim();
  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }
  const label = body.label?.trim() || null;

  try {
    const wallet = await insertPnlWallet({ userId: auth.userId, walletAddress, label });
    if (!wallet) {
      return NextResponse.json({ error: 'Ce wallet est déjà enregistré.' }, { status: 409 });
    }
    return NextResponse.json({ wallet }, { status: 201 });
  } catch (e) {
    const code = getPostgresErrorCode(e);
    if (code === '23505') {
      return NextResponse.json({ error: 'Ce wallet est déjà enregistré.' }, { status: 409 });
    }
    console.error('[POST /api/pnl/wallets]', e);
    return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 });
  }
}
