import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import {
  addPnlBackground,
  deletePnlBackground,
  listPnlBackgrounds,
} from '@/lib/repositories/pnl-backgrounds';

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized === '' ? null : normalized;
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  try {
    const backgrounds = await listPnlBackgrounds(auth.userId);
    return NextResponse.json({ backgrounds });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch backgrounds';
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

  const payload = body as { name?: unknown; imageData?: unknown };
  const name = normalizeOptionalString(payload.name);
  const imageData = normalizeString(payload.imageData);
  if (imageData === '' || !imageData.startsWith('data:image/')) {
    return NextResponse.json({ error: 'imageData is required and must be a data URL' }, { status: 400 });
  }
  if (imageData.length > 5_000_000) {
    return NextResponse.json({ error: 'Image too large' }, { status: 400 });
  }

  try {
    await addPnlBackground({ userId: auth.userId, name, imageData });
    const backgrounds = await listPnlBackgrounds(auth.userId);
    return NextResponse.json({ backgrounds });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save background';
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

  const payload = body as { id?: unknown };
  const id = normalizeString(payload.id);
  if (id === '') return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    await deletePnlBackground({ userId: auth.userId, id });
    const backgrounds = await listPnlBackgrounds(auth.userId);
    return NextResponse.json({ backgrounds });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete background';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

