import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { badRequest, notFoundError } from '@/lib/api/errors';
import { channelExistsForUser, getLeaderboard } from '@/features/telegram/repository';

export const GET = withAuth(async (req, _ctx, { userId }) => {
  const sp = new URL(req.url).searchParams;
  const channelId = sp.get('channelId')?.trim() ?? '';
  const fromIso = sp.get('from')?.trim() ?? '';
  const toIso = sp.get('to')?.trim() ?? '';
  const sortBy = sp.get('sortBy')?.trim() ?? 'profitSol';
  const dir: 'asc' | 'desc' = sp.get('dir')?.trim().toLowerCase() === 'asc' ? 'asc' : 'desc';

  if (!channelId || !fromIso || !toIso) throw badRequest('channelId_from_et_to_obligatoires');

  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
    throw badRequest('plage_dates_invalide');
  }

  if (!(await channelExistsForUser(channelId, userId))) throw notFoundError('channel_introuvable');

  const rows = await getLeaderboard({ channelId, fromIso, toIso, sortBy, dir });
  return ok({ rows });
});
