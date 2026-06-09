import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok, created } from '@/lib/api/responses';
import { badRequest } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { listPnlBackgroundsMeta, insertPnlBackground } from '@/features/pnl/repository';

/** Limite de taille du data URL base64 (~3 Mo). */
const MAX_IMAGE_DATA_LENGTH = 3 * 1024 * 1024;

export const GET = withAuth(async (_req, _ctx, { userId }) => {
  const backgrounds = await listPnlBackgroundsMeta(userId);
  return ok({ backgrounds });
});

const createSchema = z.object({
  name: z.string().optional(),
  imageData: z.string(),
});

export const POST = withAuth(async (req, _ctx, { userId }) => {
  const body = await parseBody(req, createSchema);
  if (!body.imageData.startsWith('data:image/')) {
    throw badRequest('imageData invalide (data:image/ attendu)');
  }
  if (body.imageData.length > MAX_IMAGE_DATA_LENGTH) {
    throw badRequest('Image trop volumineuse (max ~3 Mo)');
  }
  const background = await insertPnlBackground({
    userId,
    name: body.name?.trim() || null,
    imageData: body.imageData,
  });
  return created({ background });
});
