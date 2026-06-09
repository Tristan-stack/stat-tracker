import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { updatePnlWallet, deletePnlWallet } from '@/features/pnl/repository';

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({ label: z.string().optional() });

export const PATCH = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, updateSchema);
  const wallet = await updatePnlWallet({ id, userId, label: body.label?.trim() || null });
  if (!wallet) throw notFoundError('Wallet introuvable');
  return ok({ wallet });
});

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id } = await ctx.params;
  const deleted = await deletePnlWallet({ id, userId });
  if (!deleted) throw notFoundError('Wallet introuvable');
  return ok({ deleted: true });
});
