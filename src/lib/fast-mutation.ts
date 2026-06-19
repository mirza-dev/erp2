export function successfulResponseIds(
  ids: string[],
  results: PromiseSettledResult<Response>[],
): string[] {
  return ids.filter((_, index) => {
    const result = results[index];
    return result?.status === "fulfilled" && result.value.ok;
  });
}

export function decrementCount(value: number, amount = 1): number {
  return Math.max(0, value - amount);
}

export function patchCountRecord<T extends string>(
  counts: Record<T, number>,
  patches: Partial<Record<T, number>>,
): Record<T, number> {
  const next = { ...counts };
  for (const [key, delta] of Object.entries(patches) as [T, number][]) {
    next[key] = Math.max(0, (next[key] ?? 0) + delta);
  }
  return next;
}

export function removeByIds<T extends { id: string }>(rows: T[], ids: Iterable<string>): T[] {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  if (idSet.size === 0) return rows;
  return rows.filter(row => !idSet.has(row.id));
}

export function upsertFirst<T extends { id: string }>(rows: T[], row: T): T[] {
  const existingIndex = rows.findIndex(item => item.id === row.id);
  if (existingIndex === -1) return [row, ...rows];
  const next = rows.slice();
  next[existingIndex] = row;
  return next;
}
