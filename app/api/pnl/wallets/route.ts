import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok, created } from '@/lib/api/responses';
import { conflictError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { listPnlWallets, insertPnlWallet } from '@/features/pnl/repository';

export const GET = withAuth(async (_req, _ctx, { userId }) => {
  const wallets = await listPnlWallets(userId);
  return ok({ wallets });
});

const createSchema = z.object({
  walletAddress: z.string().trim().min(1, 'walletAddress is required'),
  label: z.string().trim().optional(),
});

export const POST = withAuth(
  async (req, _ctx, { userId }) => {
    const body = await parseBody(req, createSchema);
    const wallet = await insertPnlWallet({
      userId,
      walletAddress: body.walletAddress,
      label: body.label || null,
    });
    if (!wallet) throw conflictError('Ce wallet est déjà enregistré.');
    return created({ wallet });
  },
  { name: 'POST /api/pnl/wallets', dbErrors: { conflict: 'Ce wallet est déjà enregistré.' } }
);
