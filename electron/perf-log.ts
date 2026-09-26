/**
 * Dev-only startup instrumentation (DUDE_PRD.md §21 Phase 25 Item 12) -- env-gated (`DUDE_PERF_LOG`)
 * marks printed to stdout as `PERF <label> <elapsedMs>`, parsed by
 * `scripts/measure-desktop-startup.mjs`. A manual local benchmark, never wired into CI, consistent
 * with the existing `perf/` corpus's "reported, not gating" posture (DUDE_PRD.md §18.2). Disabled by
 * default, so this costs nothing in a normal launch.
 */
const enabled = !!process.env['DUDE_PERF_LOG'];
const start = process.hrtime.bigint();

export function markPerf(label: string): void {
  if (!enabled) return;
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`PERF ${label} ${elapsedMs.toFixed(1)}`);
}
