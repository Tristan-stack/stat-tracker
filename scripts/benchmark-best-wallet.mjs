#!/usr/bin/env node

function getEnv(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function percentile(sortedValues, ratio) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(sortedValues.length * ratio)));
  return sortedValues[index];
}

async function run() {
  const baseUrl = getEnv('BEST_WALLET_BASE_URL', 'http://localhost:3000');
  const ruggerId = getEnv('BEST_WALLET_RUGGER_ID');
  const analysisId = getEnv('BEST_WALLET_ANALYSIS_ID');
  const authCookie = getEnv('BEST_WALLET_COOKIE');
  const runs = Number.parseInt(getEnv('BEST_WALLET_RUNS', '3'), 10);
  const tpMinPercent = getEnv('BEST_WALLET_TP', '80');
  const tokenLimit = getEnv('BEST_WALLET_TOKEN_LIMIT', '20');
  const walletLimit = getEnv('BEST_WALLET_WALLET_LIMIT', '40');
  const candidateLimit = getEnv('BEST_WALLET_CANDIDATE_LIMIT', '16');

  if (!ruggerId || !analysisId || !authCookie) {
    throw new Error(
      'Missing required env vars: BEST_WALLET_RUGGER_ID, BEST_WALLET_ANALYSIS_ID, BEST_WALLET_COOKIE'
    );
  }

  const timings = [];
  const url = new URL(
    `/api/ruggers/${ruggerId}/analysis/${analysisId}/best-wallet`,
    baseUrl
  );
  url.searchParams.set('tpMinPercent', tpMinPercent);
  url.searchParams.set('tokenLimit', tokenLimit);
  url.searchParams.set('walletLimit', walletLimit);
  url.searchParams.set('candidateLimit', candidateLimit);

  for (let i = 0; i < runs; i += 1) {
    const startedAt = Date.now();
    const res = await fetch(url, {
      headers: {
        Cookie: authCookie,
      },
    });
    const elapsedMs = Date.now() - startedAt;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Run ${i + 1} failed: HTTP ${res.status} ${body}`);
    }
    const body = await res.json();
    timings.push(elapsedMs);
    console.log(
      JSON.stringify(
        {
          run: i + 1,
          elapsedMs,
          topWallets: body.topWallets?.length ?? 0,
          metaTimings: body.meta?.timingsMs ?? null,
          cacheHit: body.meta?.cacheHit ?? null,
          partialMode: body.meta?.partialMode ?? null,
        },
        null,
        2
      )
    );
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const avg = Math.round(sorted.reduce((acc, value) => acc + value, 0) / sorted.length);
  console.log(
    JSON.stringify(
      {
        runs,
        avgMs: avg,
        p50Ms: p50,
        p95Ms: p95,
        minMs: sorted[0],
        maxMs: sorted[sorted.length - 1],
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
