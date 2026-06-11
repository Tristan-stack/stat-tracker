import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok, created } from '@/lib/api/responses';
import { parseBody } from '@/lib/api/validate';
import {
  listRuggers,
  insertRugger,
  countRuggersForUser,
} from '@/features/ruggers/repository';
import { toNullableNumber, toHour, trimToNull } from '@/features/ruggers/normalize';
import type { StatusId } from '@/types/rugger';

const VALID_STATUS_IDS: StatusId[] = ['verification', 'en_test', 'actif'];

export const GET = withAuth(async (req, _ctx, { userId }) => {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const statusParam = searchParams.get('status');
  const status: StatusId | null =
    statusParam && VALID_STATUS_IDS.includes(statusParam as StatusId)
      ? (statusParam as StatusId)
      : null;
  const showArchived = searchParams.get('archived') === 'true';

  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20;

  const { ruggers, total } = await listRuggers({
    userId,
    page: safePage,
    pageSize: safePageSize,
    status,
    archived: showArchived,
  });

  return ok({ ruggers, page: safePage, pageSize: safePageSize, total });
});

const createSchema = z.object({
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  walletAddress: z.string().nullable().optional(),
  walletType: z.enum(['exchange', 'mother', 'simple', 'buyer']).optional(),
  volumeMin: z.union([z.number(), z.string(), z.null()]).optional(),
  volumeMax: z.union([z.number(), z.string(), z.null()]).optional(),
  startHour: z.union([z.number(), z.string(), z.null()]).optional(),
  endHour: z.union([z.number(), z.string(), z.null()]).optional(),
  notes: z.string().nullable().optional(),
});

export const POST = withAuth(
  async (req, _ctx, { userId }) => {
    const body = await parseBody(req, createSchema);

    const walletAddress = trimToNull(body.walletAddress);
    const walletType = body.walletType ?? 'simple';
    const description = trimToNull(body.description);
    const volumeMin = toNullableNumber(body.volumeMin);
    const volumeMax = toNullableNumber(body.volumeMax);
    const startHour = toHour(body.startHour);
    const endHour = toHour(body.endHour);
    const notes = trimToNull(body.notes);

    let name = trimToNull(body.name);
    if (name === null) {
      const count = await countRuggersForUser(userId);
      name = String(count + 1);
    }

    const rugger = await insertRugger({
      userId,
      name,
      description,
      walletAddress,
      walletType,
      volumeMin,
      volumeMax,
      startHour,
      endHour,
      notes,
    });

    return created(rugger);
  },
  {
    name: 'POST /api/ruggers',
    dbErrors: {
      conflict:
        'Un rugger avec cette adresse wallet existe déjà pour ton compte. Modifie l’existant ou utilise une autre adresse.',
      foreignKey: 'Compte utilisateur invalide en base. Reconnecte-toi ou contacte le support.',
    },
  }
);
