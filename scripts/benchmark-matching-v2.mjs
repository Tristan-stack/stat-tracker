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
  const baseUrl = getEnv('MATCHING_BENCH_BASE_URL', 'http://localhost:3000');
  const ruggerId = getEnv('MATCHING_BENCH_RUGGER_ID');
  const analysisId = getEnv('MATCHING_BENCH_ANALYSIS_ID');
  const authCookie = getEnv('MATCHING_BENCH_COOKIE');
  const runs = Number.parseInt(getEnv('MATCHING_BENCH_RUNS', '5'), 10);
  const limit = getEnv('MATCHING_BENCH_LIMIT', '100');
  const search = getEnv('MATCHING_BENCH_SEARCH', '');
  const sort = getEnv('MATCHING_BENCH_SORT', 'coverage:desc,confidence:desc');

  if (!ruggerId || !analysisId || !authCookie) {
    throw new Error(
      'Missing required env vars: MATCHING_BENCH_RUGGER_ID, MATCHING_BENCH_ANALYSIS_ID, MATCHING_BENCH_COOKIE'
    );
  }

  const timings = [];
  const url = new URL(`/api/ruggers/${ruggerId}/analysis/${analysisId}/leaderboard`, baseUrl);
  url.searchParams.set('limit', limit);
  url.searchParams.set('sort', sort);
  if (search !== '') url.searchParams.set('search', search);

  for (let index = 0; index < runs; index += 1) {
    const startedAt = Date.now();
    const response = await fetch(url, {
      headers: {
        Cookie: authCookie,
      },
    });
    const elapsedMs = Date.now() - startedAt;
    if (!response.ok) {
      throw new Error(`Run ${index + 1} failed: HTTP ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    const recoveredCount = Array.isArray(body.wallets)
      ? body.wallets.filter((wallet) => Array.isArray(wallet.decisionReasons) && wallet.decisionReasons.includes('wallet_centric_recovered')).length
      : 0;
    timings.push(elapsedMs);
    console.log(
      JSON.stringify(
        {
          run: index + 1,
          elapsedMs,
          wallets: body.wallets?.length ?? 0,
          total: body.total ?? 0,
          recoveredCount,
        },
        null,
        2
      )
    );
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const average = Math.round(sorted.reduce((acc, value) => acc + value, 0) / sorted.length);

  console.log(
    JSON.stringify(
      {
        runs,
        avgMs: average,
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
