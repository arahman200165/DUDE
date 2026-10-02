import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from "../../../../../../tests/property-harness";
import { msToUnit, parseTimestamp } from "@dude/tool-engine/tools/unix-timestamp/timestamp-convert";

describe('milliseconds round-trip', () => {
  it('parseTimestamp(msToUnit(ms, "milliseconds"), "milliseconds") recovers ms', () => {
    roundTrip(
      (ms: number) => String(msToUnit(ms, 'milliseconds')),
      (raw) => {
        const result = parseTimestamp(raw as string, 'milliseconds');
        if (!result.ok) throw new Error('expected parseTimestamp to succeed');
        return result.date.getTime();
      },
      fc.integer({ min: -8_640_000_000_000, max: 8_640_000_000_000 }),
    );
  });
});

describe('seconds round-trip', () => {
  it('parseTimestamp(msToUnit(seconds*1000, "seconds"), "seconds") recovers the seconds value', () => {
    roundTrip(
      (seconds: number) => String(msToUnit(seconds * 1000, 'seconds')),
      (raw) => {
        const result = parseTimestamp(raw as string, 'seconds');
        if (!result.ok) throw new Error('expected parseTimestamp to succeed');
        return Math.floor(result.date.getTime() / 1000);
      },
      fc.integer({ min: -8_640_000_000, max: 8_640_000_000 }),
    );
  });
});

describe('parseTimestamp fuzzing', () => {
  it('never throws for arbitrary input', () => {
    neverThrows(
      ([raw, unit]: [string, 'auto' | 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds']) => parseTimestamp(raw, unit),
      fc.tuple(fc.string(), fc.constantFrom('auto', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds')),
    );
  });
});
