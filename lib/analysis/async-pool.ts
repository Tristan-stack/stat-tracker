export async function runWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) return [];
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
    }
  });

  await Promise.all(runners);
  return results;
}
