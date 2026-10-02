import type { ProcessListResult, ProcessSummary } from "@dude/contracts/system/system-types";

/** Identifies one process instance across samples: a reused PID has a different `startKey`. */
export function processKey(p: { readonly pid: number; readonly startKey: string }): string {
  return `${p.pid}:${p.startKey}`;
}

/**
 * Per-process CPU use between two `process.list` samples, as a percentage of the whole machine's
 * capacity: delta(kernel + user, 100 ns) / (delta wall ms x 10 000 x logical processors) x 100, clamped
 * to 0-100. A process with no previous sample (new, or no `prev`) reports 0.
 */
export function cpuPercents(prev: ProcessListResult | null, next: ProcessListResult): Map<string, number> {
  const result = new Map<string, number>();
  const wallMs = prev ? next.sampledAtMs - prev.sampledAtMs : 0;
  const capacity = wallMs * 10_000 * Math.max(1, next.logicalProcessors);
  const before = new Map<string, ProcessSummary>();
  if (prev) for (const p of prev.processes) before.set(processKey(p), p);
  for (const p of next.processes) {
    const key = processKey(p);
    const old = before.get(key);
    if (!old || !(capacity > 0)) { result.set(key, 0); continue; }
    const delta = p.kernelTime100ns + p.userTime100ns - (old.kernelTime100ns + old.userTime100ns);
    const percent = (delta / capacity) * 100;
    result.set(key, Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0);
  }
  return result;
}
