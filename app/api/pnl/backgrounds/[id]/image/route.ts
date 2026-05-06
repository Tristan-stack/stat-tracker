import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
import { requireUser } from '@/lib/auth-session';
import { isPnlBackgroundRowId } from '@/lib/pnl-background-id';
import { parseStoredPnlDataUrlToResponseParts } from '@/lib/pnl-background-image-bytes';
import { getPnlBackgroundForUser } from '@/lib/repositories/pnl-backgrounds';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;

  const { id } = await context.params;
  if (!isPnlBackgroundRowId(id)) {
    return NextResponse.json({ error: 'Invalid background id' }, { status: 400 });
  }

  const row = await getPnlBackgroundForUser({ userId: auth.userId, id });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parts = parseStoredPnlDataUrlToResponseParts(row.image_data);
  if (!parts) return NextResponse.json({ error: 'Unsupported image' }, { status: 415 });

  return new NextResponse(Uint8Array.from(parts.body), {
    headers: {
      'Content-Type': parts.contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
