import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { buildHeaders, parseHeaders } from './http-headers-codec';
import { describeHeader } from './well-known-headers';
import { KeyValuePair } from '../../shared/models/key-value-pair.model';

// Keys that can't collide with a colon (the name/value separator), a line break, or read as an
// all-caps single "word" (which risks resembling a request/status line's leading token).
const safeKey = fc
  .string({ minLength: 1 })
  .filter((s) => !s.includes(':') && !/[\r\n]/.test(s) && s.trim() === s && !/^[A-Z]+$/.test(s));
const safeValue = fc.string().filter((s) => !/[\r\n]/.test(s)).map((s) => s.trim());
const pairArb: fc.Arbitrary<KeyValuePair> = fc.record({ key: safeKey, value: safeValue });
const pairsArb = fc.array(pairArb);

describe('http-headers-codec fuzzing', () => {
  it('parseHeaders never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseHeaders(raw), fc.string(), {
      assertShape: (result) => {
        if (!Array.isArray(result)) throw new Error('expected an array');
      },
    });
  });

  it('buildHeaders never throws for arbitrary pairs', () => {
    neverThrows((pairs: readonly KeyValuePair[]) => buildHeaders(pairs), pairsArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  it('round-trips colon/newline-free pairs through buildHeaders -> parseHeaders', () => {
    invariant(buildHeaders, pairsArb, (result, pairs) => JSON.stringify(parseHeaders(result)) === JSON.stringify(pairs));
  });
});

describe('describeHeader fuzzing', () => {
  it('never throws for arbitrary text and is case-insensitive', () => {
    neverThrows((name: string) => describeHeader(name), fc.string());
    invariant(
      (name: string) => [describeHeader(name), describeHeader(name.toUpperCase()), describeHeader(name.toLowerCase())],
      fc.string(),
      ([mixed, upper, lower]) => mixed === upper && upper === lower,
    );
  });
});
