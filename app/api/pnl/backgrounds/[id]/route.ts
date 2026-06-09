import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { getPnlBackground, deletePnlBackground } from '@/features/pnl/repository';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id } = await ctx.params;
  const background = await getPnlBackground({ id, userId });
  if (!background) throw notFoundError('Fond introuvable');
  return ok({ background });
});

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id } = await ctx.params;
  const deleted = await deletePnlBackground({ id, userId });
  if (!deleted) throw notFoundError('Fond introuvable');
  return ok({ deleted: true });
});
