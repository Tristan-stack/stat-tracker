import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import {
  getRugger,
  updateRugger,
  ruggerExists,
  deleteRuggerCascade,
  type RuggerUpdate,
} from '@/features/ruggers/repository';
import { toNullableNumber, toHour, trimToNull } from '@/features/ruggers/normalize';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id } = await ctx.params;
  const rugger = await getRugger(id, userId);
  if (!rugger) throw notFoundError('Rugger not found');
  return ok(rugger);
});

const updateSchema = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  walletAddress: z.string().nullable().optional(),
  walletType: z.enum(['exchange', 'mother', 'simple', 'buyer']).optional(),
  volumeMin: z.union([z.number(), z.string(), z.null()]).optional(),
  volumeMax: z.union([z.number(), z.string(), z.null()]).optional(),
  startHour: z.union([z.number(), z.string(), z.null()]).optional(),
  endHour: z.union([z.number(), z.string(), z.null()]).optional(),
  notes: z.string().nullable().optional(),
  statusId: z.enum(['verification', 'en_test', 'actif']).optional(),
  archived: z.boolean().optional(),
});

export const PATCH = withAuth<Ctx>(
  async (req, ctx, { userId }) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, updateSchema);

    const patch: RuggerUpdate = {};
    if (body.name !== undefined) patch.name = trimToNull(body.name);
    if (body.description !== undefined) patch.description = trimToNull(body.description);
    if (body.walletAddress !== undefined) patch.walletAddress = trimToNull(body.walletAddress);
    if (body.walletType !== undefined) patch.walletType = body.walletType;
    if (body.volumeMin !== undefined) patch.volumeMin = toNullableNumber(body.volumeMin);
    if (body.volumeMax !== undefined) patch.volumeMax = toNullableNumber(body.volumeMax);
    if (body.startHour !== undefined) patch.startHour = toHour(body.startHour);
    if (body.endHour !== undefined) patch.endHour = toHour(body.endHour);
    if (body.notes !== undefined) patch.notes = trimToNull(body.notes);
    if (body.statusId !== undefined) patch.statusId = body.statusId;
    if (body.archived !== undefined) patch.archived = body.archived;

    const rugger = await updateRugger(id, userId, patch);
    if (!rugger) throw notFoundError('Rugger not found');
    return ok(rugger);
  },
  {
    name: 'PATCH /api/ruggers/[id]',
    dbErrors: { conflict: 'Une autre entrée utilise déjà cette adresse wallet.' },
  }
);

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id } = await ctx.params;
  if (!(await ruggerExists(id, userId))) throw notFoundError('Rugger not found');
  await deleteRuggerCascade(id, userId);
  return ok({ ok: true });
});
