import { z } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { ok } from '@/lib/api/responses';
import { badRequest, notFoundError } from '@/lib/api/errors';
import { parseBody } from '@/lib/api/validate';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { getRuggerWalletInfo } from '@/features/ruggers/repository';
import {
  listAnalyses,
  deleteAllAnalyses,
  createAnalysis,
  getRuggerTokenAddresses,
} from '@/features/analysis/repository';
import { runAnalysisPipeline, type PipelineOpts } from '@/lib/analysis/run-analysis';
import type { AnalysisMode } from '@/types/analysis';

// Vercel Hobby plafonne maxDuration à 60s ; l'analyse longue est découpée en steps.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const VALID_MODES: AnalysisMode[] = ['token', 'funding', 'combined', 'token_hunting'];

const postSchema = z.object({
  mode: z.string().optional(),
  tokenAddresses: z.array(z.string()).optional(),
  fundingDepth: z.number().optional(),
  walletCentricRecoveryLimit: z.number().nullable().optional(),
  excludeInactiveOver24h: z.boolean().optional(),
  mcapMin: z.number().nullable().optional(),
  mcapMax: z.number().nullable().optional(),
});

export const POST = withAuth<Ctx>(async (req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');

  const body = await parseBody(req, postSchema);

  const mode = (body.mode ?? 'combined') as AnalysisMode;
  if (!VALID_MODES.includes(mode)) {
    throw badRequest('Invalid mode. Use: token, funding, combined, or token_hunting');
  }

  const fundingDepth = body.fundingDepth ?? 5;
  if (fundingDepth < 1 || fundingDepth > 5) throw badRequest('fundingDepth must be between 1 and 5');

  const info = await getRuggerWalletInfo(ruggerId, userId);
  const ruggerWallet = info?.walletAddress ?? null;
  if (!ruggerWallet && mode !== 'token_hunting') {
    throw badRequest('Rugger has no primary wallet configured');
  }

  const tokens =
    body.tokenAddresses && body.tokenAddresses.length > 0
      ? body.tokenAddresses.map((address) => ({ address, name: null as string | null }))
      : await getRuggerTokenAddresses(ruggerId);

  if ((mode === 'token' || mode === 'combined' || mode === 'token_hunting') && tokens.length === 0) {
    throw badRequest('No tokens available. Add tokens to the rugger or provide tokenAddresses.');
  }

  let walletCentricRecoveryLimit: number | undefined;
  if (body.walletCentricRecoveryLimit != null) {
    if (!Number.isFinite(body.walletCentricRecoveryLimit)) {
      throw badRequest('walletCentricRecoveryLimit must be a finite number');
    }
    walletCentricRecoveryLimit = body.walletCentricRecoveryLimit;
  }

  let mcapMin: number | undefined;
  if (body.mcapMin != null) {
    if (!Number.isFinite(body.mcapMin) || body.mcapMin < 0) throw badRequest('mcapMin must be a finite number >= 0');
    mcapMin = body.mcapMin;
  }
  let mcapMax: number | undefined;
  if (body.mcapMax != null) {
    if (!Number.isFinite(body.mcapMax) || body.mcapMax < 0) throw badRequest('mcapMax must be a finite number >= 0');
    mcapMax = body.mcapMax;
  }
  if (mcapMin !== undefined && mcapMax !== undefined && mcapMin > mcapMax) {
    throw badRequest('mcapMin must be <= mcapMax');
  }

  const analysisId = await createAnalysis({ ruggerId, mode, fundingDepth, tokenCount: tokens.length });

  const pipelineOpts: PipelineOpts = {
    mode,
    fundingDepth,
    buyerLimit: 200,
    walletCentricRecoveryLimit,
    excludeInactiveOver24h: Boolean(body.excludeInactiveOver24h),
    mcapMin,
    mcapMax,
  };

  const encoder = new TextEncoder();
  let clientDisconnected = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const markDisconnected = () => {
    clientDisconnected = true;
  };
  req.signal.addEventListener('abort', markDisconnected);

  const emit = (event: string, data: Record<string, unknown>) => {
    if (clientDisconnected || !streamController) return;
    try {
      streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch {
      markDisconnected();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      emit('ping', { analysisId });

      runAnalysisPipeline(analysisId, tokens, ruggerWallet ?? null, userId, pipelineOpts, emit)
        .catch((error) => {
          if (clientDisconnected) return;
          const message = error instanceof Error ? error.message : 'Erreur inconnue pendant le pipeline';
          emit('error', { analysisId, message });
          console.error('Analysis pipeline failed', { analysisId, message });
        })
        .finally(() => {
          if (!clientDisconnected) {
            try {
              controller.close();
            } catch {
              /* stream already closed */
            }
          }
        });
    },
    cancel() {
      markDisconnected();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
});

export const DELETE = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');
  const deletedCount = await deleteAllAnalyses(ruggerId);
  return ok({ ok: true, deletedCount });
});

export const GET = withAuth<Ctx>(async (_req, ctx, { userId }) => {
  const { id: ruggerId } = await ctx.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) throw notFoundError('Rugger not found');
  const analyses = await listAnalyses(ruggerId);
  return ok({ analyses });
});
