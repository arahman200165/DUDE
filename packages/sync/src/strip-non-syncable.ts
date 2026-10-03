/**
 * Remove preference overrides that must not sync. Returns undefined when nothing remains.
 * Structurally typed (`Record<toolId, Record<key, string>>`) so sync stays dependency-free.
 */
export function stripNonSyncable(
  overrides: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
  isSyncable: (toolId: string, key: string) => boolean,
): Record<string, Record<string, string>> | undefined {
  if (!overrides) return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [toolId, keys] of Object.entries(overrides)) {
    const kept: Record<string, string> = {};
    for (const [key, value] of Object.entries(keys)) if (isSyncable(toolId, key)) kept[key] = value;
    if (Object.keys(kept).length > 0) out[toolId] = kept;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
