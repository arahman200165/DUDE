import type { ProcessSummary } from "@dude/contracts/system/system-types";

export { formatBytes } from "../../shared/fs/format-size.js";

export interface ProcessRow {
  readonly process: ProcessSummary;
  readonly key: string;
  /** Share of total machine CPU, 0-100. */
  readonly cpu: number;
}

/** Per-process facts that only exist once loaded; a filter term over one of them ignores processes without it. */
export interface SearchContext {
  readonly commandLines: ReadonlyMap<string, string>;
  readonly portsByPid: ReadonlyMap<number, readonly number[]>;
  readonly modulesByKey: ReadonlyMap<string, readonly string[]>;
}

export type TermField = 'any' | 'name' | 'pid' | 'port' | 'cmd' | 'mod';
export interface SearchTerm { readonly field: TermField; readonly value: string }

const FIELDS: readonly TermField[] = ['name', 'pid', 'port', 'cmd', 'mod'];

/** Whitespace-separated terms; `pid:`, `port:`, `cmd:`, `mod:` and `name:` prefixes scope a term. All terms must match. */
export function parseQuery(query: string): SearchTerm[] {
  const terms: SearchTerm[] = [];
  for (const raw of query.trim().split(/\s+/)) {
    if (!raw) continue;
    const colon = raw.indexOf(':');
    const prefix = colon > 0 ? (raw.slice(0, colon).toLowerCase() as TermField) : undefined;
    if (prefix && FIELDS.includes(prefix) && raw.length > colon + 1) terms.push({ field: prefix, value: raw.slice(colon + 1).toLowerCase() });
    else terms.push({ field: 'any', value: raw.toLowerCase() });
  }
  return terms;
}

function matchesTerm(process: ProcessSummary, key: string, term: SearchTerm, ctx: SearchContext): boolean {
  const name = process.name.toLowerCase().includes(term.value);
  const pid = String(process.pid) === term.value || (term.field === 'pid' && String(process.pid).startsWith(term.value));
  const port = (ctx.portsByPid.get(process.pid) ?? []).some((p) => String(p) === term.value);
  const cmd = (ctx.commandLines.get(key) ?? '').toLowerCase().includes(term.value);
  const mod = (ctx.modulesByKey.get(key) ?? []).some((m) => m.toLowerCase().includes(term.value));
  switch (term.field) {
    case 'name': return name;
    case 'pid': return pid;
    case 'port': return port;
    case 'cmd': return cmd;
    case 'mod': return mod;
    default: return name || pid || port || cmd || mod;
  }
}

export function matchesQuery(process: ProcessSummary, key: string, terms: readonly SearchTerm[], ctx: SearchContext): boolean {
  return terms.every((term) => matchesTerm(process, key, term, ctx));
}

export function filterRows(rows: readonly ProcessRow[], query: string, ctx: SearchContext): readonly ProcessRow[] {
  const terms = parseQuery(query);
  return terms.length ? rows.filter((row) => matchesQuery(row.process, row.key, terms, ctx)) : rows;
}

export type SortKey = 'name' | 'pid' | 'cpu' | 'workingSet' | 'private' | 'threads' | 'handles' | 'session' | 'started';

const SORT_VALUE: Record<SortKey, (row: ProcessRow) => number | string> = {
  name: (r) => r.process.name.toLowerCase(),
  pid: (r) => r.process.pid,
  cpu: (r) => r.cpu,
  workingSet: (r) => r.process.workingSetBytes,
  private: (r) => r.process.privateBytes,
  threads: (r) => r.process.threadCount,
  handles: (r) => r.process.handleCount,
  session: (r) => r.process.sessionId,
  started: (r) => r.process.createTimeMs,
};

export function sortProcessRows(rows: readonly ProcessRow[], key: SortKey, direction: 'asc' | 'desc'): ProcessRow[] {
  const value = SORT_VALUE[key];
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const order = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number);
    return factor * order || a.process.pid - b.process.pid;
  });
}

export function formatCpu(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return '0.0';
  return percent < 0.05 ? '<0.1' : percent.toFixed(1);
}

/** Elapsed-time label for a start time, e.g. `3d 4h`, `2h 5m`, `45s`. Unknown (0) start times show a dash. */
export function formatAge(createTimeMs: number, nowMs: number): string {
  if (!(createTimeMs > 0) || nowMs < createTimeMs) return '—';
  const seconds = Math.floor((nowMs - createTimeMs) / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/** CPU time in 100 ns units as `h:mm:ss.cc`. */
export function formatCpuTime(hundredNs: number): string {
  const centis = Math.floor(hundredNs / 100_000);
  const total = Math.floor(centis / 100);
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}.${pad(centis % 100)}`;
}

/** Appends to a fixed-size ring of the most recent samples. */
export function pushSample(history: readonly number[] | undefined, value: number, capacity = 60): number[] {
  const next = [...(history ?? []), value];
  return next.length > capacity ? next.slice(next.length - capacity) : next;
}
