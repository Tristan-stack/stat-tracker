import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { ruggerExistsForUser } from '@/lib/rugger-access';
import { query } from '@/lib/db';
import { runAnalysisPipeline, type PipelineOpts } from '@/lib/analysis/run-analysis';
import type { AnalysisMode } from '@/types/analysis';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const VALID_MODES: AnalysisMode[] = ['token', 'funding', 'combined'];

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const body = (await req.json()) as {
    mode?: AnalysisMode;
    tokenAddresses?: string[];
    fundingDepth?: number;
  };

  const mode = body.mode ?? 'combined';
  if (!VALID_MODES.includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode. Use: token, funding, or combined' }, { status: 400 });
  }

  const fundingDepth = body.fundingDepth ?? 5;
  if (fundingDepth < 1 || fundingDepth > 5) {
    return NextResponse.json({ error: 'fundingDepth must be between 1 and 5' }, { status: 400 });
  }

  const rugger = await query<{ wallet_address: string }>(
    'SELECT wallet_address FROM ruggers WHERE id = $1',
    [ruggerId]
  );
  const ruggerWallet = rugger[0]?.wallet_address;
  if (!ruggerWallet) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  let tokens: { address: string; name: string | null }[];
  if (body.tokenAddresses && body.tokenAddresses.length > 0) {
    tokens = body.tokenAddresses.map((addr) => ({ address: addr, name: null }));
  } else {
    const dbTokens = await query<{ token_address: string; token_name: string | null }>(
      'SELECT token_address, token_name FROM rugger_tokens WHERE rugger_id = $1 AND token_address IS NOT NULL',
      [ruggerId]
    );
    tokens = dbTokens.map((t) => ({ address: t.token_address, name: t.token_name }));
  }

  if ((mode === 'token' || mode === 'combined') && tokens.length === 0) {
    return NextResponse.json(
      { error: 'No tokens available. Add tokens to the rugger or provide tokenAddresses.' },
      { status: 400 }
    );
  }

  const analysisRows = await query<{ id: string }>(
    `INSERT INTO wallet_analyses (id, rugger_id, mode, status, funding_depth, buyer_limit, token_count)
     VALUES (gen_random_uuid(), $1, $2, 'pending', $3, 200, $4)
     RETURNING id`,
    [ruggerId, mode, fundingDepth, tokens.length]
  );
  const analysisId = analysisRows[0].id;

  const pipelineOpts: PipelineOpts = { mode, fundingDepth, buyerLimit: 200 };

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const emit = (event: string, data: Record<string, unknown>) => {
    writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => {});
  };

  runAnalysisPipeline(analysisId, tokens, ruggerWallet, userId, pipelineOpts, emit)
    .finally(() => writer.close().catch(() => {}));

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

interface AnalysisRow {
  id: string;
  mode: string;
  status: string;
  funding_depth: number;
  buyer_limit: number;
  token_count: number;
  buyer_count: number;
  progress: number;
  progress_label: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId } = await context.params;
  if (!(await ruggerExistsForUser(ruggerId, userId))) {
    return NextResponse.json({ error: 'Rugger not found' }, { status: 404 });
  }

  const rows = await query<AnalysisRow>(
    `SELECT id, mode, status, funding_depth, buyer_limit, token_count, buyer_count,
            progress, progress_label, error_message, created_at, completed_at
     FROM wallet_analyses
     WHERE rugger_id = $1
     ORDER BY created_at DESC`,
    [ruggerId]
  );

  const analyses = rows.map((r) => ({
    id: r.id,
    mode: r.mode,
    status: r.status,
    fundingDepth: r.funding_depth,
    buyerLimit: r.buyer_limit,
    tokenCount: r.token_count,
    buyerCount: r.buyer_count,
    progress: r.progress,
    progressLabel: r.progress_label,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  }));

  return NextResponse.json({ analyses });
}
