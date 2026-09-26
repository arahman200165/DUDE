import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows, roundTrip } from '../../../testing/property-harness';
import { parseDuration } from './duration-convert';

interface DurationComponents {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

const componentsArb: fc.Arbitrary<DurationComponents> = fc.record({
  days: fc.nat({ max: 40 }),
  hours: fc.integer({ min: 0, max: 23 }),
  minutes: fc.integer({ min: 0, max: 59 }),
  seconds: fc.integer({ min: 0, max: 59 }),
});

const toHumanShorthand = (c: DurationComponents) => `${c.days}d ${c.hours}h ${c.minutes}m ${c.seconds}s`;

describe('parseDuration round-trip', () => {
  it('recovers the same day/hour/minute/second breakdown from a constructed human-shorthand string', () => {
    roundTrip(
      toHumanShorthand,
      (input) => {
        const result = parseDuration(input as string);
        if (!result.ok) throw new Error('expected parseDuration to succeed');
        const { days, hours, minutes, seconds } = result.result.breakdown;
        return { days, hours, minutes, seconds };
      },
      componentsArb,
    );
  });

  it('the iso8601 representation parses back to the same millisecond value', () => {
    invariant(
      (c: DurationComponents) => {
        const first = parseDuration(toHumanShorthand(c));
        if (!first.ok) throw new Error('expected parseDuration to succeed');
        const second = parseDuration(first.result.iso8601);
        if (!second.ok) throw new Error('expected the iso8601 output to itself parse');
        return { firstMs: first.result.ms, secondMs: second.result.ms };
      },
      componentsArb,
      ({ firstMs, secondMs }) => firstMs === secondMs,
    );
  });
});

describe('parseDuration fuzzing', () => {
  it('never throws for arbitrary input', () => {
    neverThrows((input: string) => parseDuration(input), fc.string());
  });
});
