/** Upsert by id, preserving order: existing ids are replaced in place, new ids appended. */
export function upsertById<T extends { readonly id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map(incoming.map((item) => [item.id, item]));
  const merged = existing.map((item) => byId.get(item.id) ?? item);
  const known = new Set(existing.map((item) => item.id));
  return [...merged, ...incoming.filter((item) => !known.has(item.id))];
}
