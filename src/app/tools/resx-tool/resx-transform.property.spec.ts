import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { parseResx } from './resx-transform';

describe('RESX transform properties', () => {
  it('never throws while parsing arbitrary XML text', () => {
    neverThrows(parseResx, fc.string(), { assertShape: (result) => expect(typeof result).toBe('object') });
  });
});
