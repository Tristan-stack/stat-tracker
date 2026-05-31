import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { insertPnlBackground, listPnlBackgroundsMeta } from '@/lib/repositories/pnl-backgrounds';

/** Limite de taille du data URL base64 (~3 Mo). */
const MAX_IMAGE_DATA_LENGTH = 3 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const backgrounds = await listPnlBackgroundsMeta(auth.userId);
  return NextResponse.json({ backgrounds });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;

  const body = (await req.json()) as { name?: string; imageData?: string };
  const imageData = body.imageData;
  if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
    return NextResponse.json({ error: 'imageData invalide (data:image/ attendu)' }, { status: 400 });
  }
  if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
    return NextResponse.json({ error: 'Image trop volumineuse (max ~3 Mo)' }, { status: 400 });
  }
  const name = body.name?.trim() || null;

  const background = await insertPnlBackground({ userId: auth.userId, name, imageData });
  return NextResponse.json({ background }, { status: 201 });
}
