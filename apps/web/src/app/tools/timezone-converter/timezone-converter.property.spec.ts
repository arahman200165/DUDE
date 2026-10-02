import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, roundTrip } from "../../../../../../tests/property-harness";
import { convertToZones } from "@dude/tool-engine/tools/timezone-converter/timezone-convert";

const pad = (n: number) => String(n).padStart(2, '0');
// Zones observing real-world DST paired with a fixed day-of-month (15) that falls outside every
// known DST transition window used here, so forward/backward conversion never crosses an
// ambiguous or nonexistent local-time gap.
const zoneArb = fc.constantFrom('America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'Asia/Kolkata', 'UTC');

interface Moment {
  readonly year: number;
  readonly month: number;
  readonly hour: number;
  readonly minute: number;
  readonly zone: string;
}

const momentArb: fc.Arbitrary<Moment> = fc.record({
  year: fc.integer({ min: 2015, max: 2035 }),
  month: fc.integer({ min: 1, max: 12 }),
  hour: fc.integer({ min: 0, max: 23 }),
  minute: fc.integer({ min: 0, max: 59 }),
  zone: zoneArb,
});

describe('convertToZones round-trip (UTC -> zone -> UTC)', () => {
  it('converting to a zone and back recovers the original wall-clock time', () => {
    roundTrip(
      (m: Moment) => {
        const date = `${m.year}-${pad(m.month)}-15`;
        const time = `${pad(m.hour)}:${pad(m.minute)}:00`;
        const forward = convertToZones({ date, time, sourceZone: 'UTC' }, [m.zone]);
        if (!forward.ok) throw new Error('expected forward conversion to succeed');
        return { forward: forward.results[0].formatted, zone: m.zone };
      },
      (encoded) => {
        const { forward, zone } = encoded as { forward: string; zone: string };
        const [date2, time2] = forward.split(' ');
        const back = convertToZones({ date: date2, time: time2, sourceZone: zone }, ['UTC']);
        if (!back.ok) throw new Error('expected backward conversion to succeed');
        const [date3, time3] = back.results[0].formatted.split(' ');
        return {
          year: Number(date3.slice(0, 4)),
          month: Number(date3.slice(5, 7)),
          hour: Number(time3.slice(0, 2)),
          minute: Number(time3.slice(3, 5)),
          zone,
        };
      },
      momentArb,
    );
  });
});

describe('convertToZones fuzzing', () => {
  it('never throws for arbitrary input', () => {
    neverThrows(
      ([date, time, sourceZone, targetZone]: [string, string, string, string]) => convertToZones({ date, time, sourceZone }, [targetZone]),
      fc.tuple(fc.string(), fc.string(), fc.string(), fc.string()),
    );
  });
});
