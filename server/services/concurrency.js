export async function mapWithConcurrencyLimit(items, limit, iteratee) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];

  const maxConcurrent = Math.max(1, Math.min(Number(limit) || 1, list.length));
  const results = new Array(list.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= list.length) return;
      results[currentIndex] = await iteratee(list[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: maxConcurrent }, () => worker()));
  return results;
}