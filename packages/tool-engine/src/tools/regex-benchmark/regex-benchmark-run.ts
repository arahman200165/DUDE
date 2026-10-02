/**
 * Pure, framework-free single-sample timed match. Dispatched once per sample
 * input by the component (not looped inside one worker) so a hung sample only
 * costs that one worker — already-timed samples stay intact and the run can
 * continue to the next sample instead of losing everything on one bad input.
 */
export interface BenchmarkPayload {
  readonly pattern: string;
  readonly flags: string;
  readonly sample: string;
}

export type BenchmarkTimingResult =
  | { readonly ok: true; readonly ms: number; readonly matched: boolean }
  | { readonly ok: false; readonly error: string };

export function timeSample(payload: BenchmarkPayload): BenchmarkTimingResult {
  let regex: RegExp;
  try {
    regex = new RegExp(payload.pattern, payload.flags);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid pattern.' };
  }

  const start = performance.now();
  const matched = regex.test(payload.sample);
  const ms = performance.now() - start;

  return { ok: true, ms, matched };
}
