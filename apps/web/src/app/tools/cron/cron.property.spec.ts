import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { parseCronExpression } from "@dude/tool-engine/tools/cron/cron-parse";

const NOW = new Date('2026-09-20T00:00:00Z');

// Days capped at 28 to avoid generating a day-of-month/month combination that can never occur
// (e.g. day 31 in February), which would make the schedule unsatisfiable rather than just invalid.
const field = (min: number, max: number) => fc.oneof(fc.constant('*'), fc.integer({ min, max }).map(String));
const cronExprArb = fc
  .tuple(field(0, 59), field(0, 23), field(1, 28), field(1, 12), field(0, 6))
  .map((fields) => fields.join(' '));

describe('parseCronExpression fuzzing', () => {
  it('never throws for arbitrary text', () => {
    neverThrows((expr: string) => parseCronExpression(expr, { count: 3, tz: 'utc', now: NOW }), fc.string({ maxLength: 30 }));
  });

  it('never throws for well-formed-but-arbitrary cron expressions', () => {
    neverThrows((expr: string) => parseCronExpression(expr, { count: 5, tz: 'utc', now: NOW }), cronExprArb);
  });
});

describe('parseCronExpression invariants', () => {
  it('produces the requested count of strictly-ordered next/previous runs around `now`', () => {
    invariant(
      (expr: string) => parseCronExpression(expr, { count: 4, tz: 'utc', now: NOW }),
      cronExprArb,
      (result) => {
        if (!result.ok) return true; // some field combinations are still rejected by the library; that's fine
        if (result.nextRuns.length !== 4 || result.previousRuns.length !== 4) return false;
        for (let i = 1; i < result.nextRuns.length; i++) {
          if (result.nextRuns[i].date.getTime() <= result.nextRuns[i - 1].date.getTime()) return false;
        }
        for (let i = 1; i < result.previousRuns.length; i++) {
          if (result.previousRuns[i].date.getTime() >= result.previousRuns[i - 1].date.getTime()) return false;
        }
        return result.previousRuns.every((run) => run.date.getTime() < NOW.getTime());
      },
    );
  });
});
