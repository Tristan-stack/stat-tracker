import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { addPnlWallet, deletePnlWallet, listPnlWallets } from '@/lib/repositories/pnl-wallets';

function normalizeAddress(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  try {
    const wallets = await listPnlWallets(auth.userId);
    return NextResponse.json({ wallets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch wallets';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const payload = body as { walletAddress?: unknown; label?: unknown };
  const walletAddress = normalizeAddress(payload.walletAddress);
  const label = normalizeLabel(payload.label);
  if (walletAddress === '') {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  try {
    await addPnlWallet({ userId: auth.userId, walletAddress, label });
    const wallets = await listPnlWallets(auth.userId);
    return NextResponse.json({ wallets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save wallet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const payload = body as { walletAddress?: unknown };
  const walletAddress = normalizeAddress(payload.walletAddress);
  if (walletAddress === '') {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  try {
    await deletePnlWallet({ userId: auth.userId, walletAddress });
    const wallets = await listPnlWallets(auth.userId);
    return NextResponse.json({ wallets });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete wallet';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

