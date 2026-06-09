import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withAuth } from '@/lib/api/with-auth';
import { ok, created } from '@/lib/api/responses';
import { badRequest } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { listChannels, insertChannel, getChannelById } from '@/features/telegram/repository';
import { normalizeTelegramUsername } from '@/lib/telegram/username';

export const GET = withAuth(async (_req, _ctx, { userId }) => {
  const channels = await listChannels(userId);
  return ok({ channels });
});

const createSchema = z.object({
  username: z.string().optional(),
  label: z.string().nullable().optional(),
});

export const POST = withAuth(
  async (req, _ctx, { userId }) => {
    const body = await parseBody(req, createSchema);
    const username = normalizeTelegramUsername(body.username ?? '');
    if (username.length < 3 || username.length > 64) throw badRequest('username_invalide');

    const id = randomUUID();
    await insertChannel({ id, userId, username, label: body.label?.trim() || null });
    const channel = await getChannelById(id, userId);
    return created({ channel: channel ?? null });
  },
  { name: 'POST /api/rugger-telegram/channels', dbErrors: { conflict: 'channel_deja_enregistre' } }
);
