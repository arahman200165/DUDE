export interface EnvironmentRecord {
  environmentId: string;
  /** 'standalone' until a Hub enrolls the device (31C). */
  kind: 'standalone';
  /** ISO-8601. */
  createdAt: string;
}

export function decodeEnvironmentRecord(raw: unknown): EnvironmentRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['environmentId'] !== 'string' || r['environmentId'].length === 0) return null;
  if (r['kind'] !== 'standalone') return null;
  if (typeof r['createdAt'] !== 'string' || Number.isNaN(Date.parse(r['createdAt']))) return null;
  return { environmentId: r['environmentId'], kind: 'standalone', createdAt: r['createdAt'] };
}
