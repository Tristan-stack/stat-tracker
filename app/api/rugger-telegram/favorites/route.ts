import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok, created } from '@/lib/api/responses';
import { badRequest, notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import {
  channelExistsForUser,
  listFavorites,
  upsertFavorite,
  deleteFavorite,
} from '@/features/telegram/repository';

/** Liste des favoris pour un canal. */
export const GET = withAuth(async (req, _ctx, { userId }) => {
  const channelId = new URL(req.url).searchParams.get('channelId')?.trim() ?? '';
  if (!channelId) throw badRequest('channelId_obligatoire');
  if (!(await channelExistsForUser(channelId, userId))) throw notFoundError('channel_introuvable');

  const favorites = await listFavorites(userId, channelId);
  return ok({ favorites });
});

const postSchema = z.object({
  channelId: z.string().optional(),
  tokenMint: z.string().optional(),
  tokenName: z.string().nullable().optional(),
});

/** Ajouter / mettre à jour un favori. */
export const POST = withAuth(async (req, _ctx, { userId }) => {
  const body = await parseBody(req, postSchema);
  const channelId = body.channelId?.trim() ?? '';
  const tokenMint = body.tokenMint?.trim() ?? '';
  const tokenName = typeof body.tokenName === 'string' ? body.tokenName.trim() || null : null;

  if (!channelId || !tokenMint) throw badRequest('channelId_et_tokenMint_obligatoires');
  if (!(await channelExistsForUser(channelId, userId))) throw notFoundError('channel_introuvable');

  await upsertFavorite({ userId, channelId, tokenMint, tokenName });
  return created({ ok: true });
});

/** Retirer un favori. */
export const DELETE = withAuth(async (req, _ctx, { userId }) => {
  const sp = new URL(req.url).searchParams;
  const channelId = sp.get('channelId')?.trim() ?? '';
  const mint = sp.get('mint')?.trim() ?? '';
  if (!channelId || !mint) throw badRequest('channelId_et_mint_obligatoires');
  if (!(await channelExistsForUser(channelId, userId))) throw notFoundError('channel_introuvable');

  await deleteFavorite(userId, channelId, mint);
  return ok({ ok: true });
});
