import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { exploreDstTransitions } from './dst-transition-explorer-logic';

const zoneArb = fc.constantFrom('America/New_York', 'Europe/London', 'Australia/Sydney', 'Pacific/Auckland', 'Europe/Berlin', 'America/Chicago');
const yearArb = fc.integer({ min: 2015, max: 2035 });

describe('exploreDstTransitions fuzzing', () => {
  it('never throws for arbitrary zone/year input', () => {
    neverThrows(
      ([zone, year]: [string, number]) => exploreDstTransitions(zone, year),
      fc.tuple(fc.string(), fc.integer({ min: -5000, max: 5000 })),
    );
  });
});

describe('exploreDstTransitions invariants', () => {
  it('every transition row has a real offset change and rows are date-ordered', () => {
    invariant(
      ([zone, year]: [string, number]) => exploreDstTransitions(zone, year),
      fc.tuple(zoneArb, yearArb),
      (result) =>
        result.ok &&
        result.rows.every(
          (row, i) => row.fromOffset !== row.toOffset && row.gapMinutes > 0 && (i === 0 || result.ok && result.rows[i - 1].date <= row.date),
        ),
    );
  });
});
