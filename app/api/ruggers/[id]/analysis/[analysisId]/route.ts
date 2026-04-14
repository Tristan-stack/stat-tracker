import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-session';
import { query } from '@/lib/db';

interface AnalysisDetailRow {
  id: string;
  rugger_id: string;
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
  context: { params: Promise<{ id: string; analysisId: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, analysisId } = await context.params;

  const rows = await query<AnalysisDetailRow>(
    `SELECT wa.id, wa.rugger_id, wa.mode, wa.status, wa.funding_depth, wa.buyer_limit,
            wa.token_count, wa.buyer_count, wa.progress, wa.progress_label,
            wa.error_message, wa.created_at, wa.completed_at
     FROM wallet_analyses wa
     JOIN ruggers r ON r.id = wa.rugger_id
     WHERE wa.id = $1 AND wa.rugger_id = $2 AND r.user_id = $3`,
    [analysisId, ruggerId, userId]
  );

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    ruggerId: row.rugger_id,
    mode: row.mode,
    status: row.status,
    fundingDepth: row.funding_depth,
    buyerLimit: row.buyer_limit,
    tokenCount: row.token_count,
    buyerCount: row.buyer_count,
    progress: row.progress,
    progressLabel: row.progress_label,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; analysisId: string }> }
) {
  const auth = await requireUser(req);
  if ('response' in auth) return auth.response;
  const { userId } = auth;

  const { id: ruggerId, analysisId } = await context.params;

  const deleted = await query<{ id: string }>(
    `DELETE FROM wallet_analyses wa
     USING ruggers r
     WHERE wa.id = $1 AND wa.rugger_id = $2 AND r.id = wa.rugger_id AND r.user_id = $3
     RETURNING wa.id`,
    [analysisId, ruggerId, userId]
  );

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
