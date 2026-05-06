import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Webhook Helius (auth uniquement). La persistance « notifications watchlist » a été retirée du produit.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('HELIUS_WEBHOOK_SECRET is not configured; rejecting webhook');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const providedSecret = req.headers.get('authorization') ?? '';
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  return NextResponse.json({ ok: true, processed: 0 });
}
