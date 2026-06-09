import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { deleteChannel } from '@/features/telegram/repository';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id } = await ctx.params;
  const deleted = await deleteChannel(id, userId);
  if (!deleted) throw notFoundError('Not found');
  return ok({ ok: true });
});
