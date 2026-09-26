import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { buildCookieHeader, parseCookieHeader } from './cookie-header';
import { EMPTY_SET_COOKIE, SameSite, SetCookieAttributes, buildSetCookieHeader, checkSetCookieWarnings, parseSetCookieHeader } from './set-cookie';
import { KeyValuePair } from '../../shared/models/key-value-pair.model';

const pairArb: fc.Arbitrary<KeyValuePair> = fc.record({ key: fc.string(), value: fc.string() });
const pairsArb = fc.array(pairArb);

const sameSiteArb: fc.Arbitrary<SameSite> = fc.constantFrom('', 'Strict', 'Lax', 'None');
// parseSetCookieHeader trims every attribute value (and the name/value pair itself) when
// reparsing, so a value with leading/trailing whitespace never survives a round trip — the
// arbitrary pre-trims to stay inside the part of the domain that genuinely round-trips.
const trimmedString = fc.string().map((s) => s.trim());
const setCookieArb: fc.Arbitrary<SetCookieAttributes> = fc.record({
  name: trimmedString,
  value: trimmedString,
  domain: trimmedString,
  path: trimmedString,
  expires: trimmedString,
  maxAge: trimmedString,
  secure: fc.boolean(),
  httpOnly: fc.boolean(),
  sameSite: sameSiteArb,
});

describe('cookie-header fuzzing', () => {
  it('parseCookieHeader never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseCookieHeader(raw), fc.string(), {
      assertShape: (result) => {
        if (!Array.isArray(result)) throw new Error('expected an array');
      },
    });
  });

  it('buildCookieHeader never throws for arbitrary pairs', () => {
    neverThrows((pairs: readonly KeyValuePair[]) => buildCookieHeader(pairs), pairsArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });
});

describe('set-cookie fuzzing', () => {
  it('parseSetCookieHeader never throws for arbitrary text', () => {
    neverThrows((raw: string) => parseSetCookieHeader(raw), fc.string(), {
      assertShape: (result) => {
        if (typeof (result as SetCookieAttributes).name !== 'string') throw new Error('expected SetCookieAttributes');
      },
    });
  });

  it('buildSetCookieHeader never throws for arbitrary attributes', () => {
    neverThrows((attrs: SetCookieAttributes) => buildSetCookieHeader(attrs), setCookieArb, {
      assertShape: (result) => {
        if (typeof result !== 'string') throw new Error('expected a string');
      },
    });
  });

  it('is empty exactly when there is no name, otherwise non-empty and reparses to the same name', () => {
    // A name containing ';' or '=' would be split into extra pseudo-attributes on reparse (the
    // wire format's own ambiguity, not a bug) — sanitized out here so the invariant targets names
    // that genuinely round-trip.
    invariant(
      buildSetCookieHeader,
      setCookieArb.map((attrs) => ({ ...attrs, name: attrs.name.replace(/[;=]/g, '') })),
      (result, attrs) => {
        if (attrs.name === '') return result === '';
        return result !== '' && parseSetCookieHeader(result).name === attrs.name;
      },
    );
  });

  it('checkSetCookieWarnings never throws and returns a bounded list of strings', () => {
    invariant(
      checkSetCookieWarnings,
      setCookieArb,
      (result) => Array.isArray(result) && result.length <= 4 && result.every((w) => typeof w === 'string'),
    );
  });

  it('EMPTY_SET_COOKIE round-trips to an empty header', () => {
    if (buildSetCookieHeader(EMPTY_SET_COOKIE) !== '') throw new Error('expected an empty header for EMPTY_SET_COOKIE');
  });
});
