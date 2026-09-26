import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { parseJsonl } from './jsonl-viewer-transform';

describe('JSONL viewer properties', () => {
  it('never throws for arbitrary line input', () => {
    neverThrows(parseJsonl, fc.string(), { assertShape: (result) => expect(typeof result).toBe('object') });
  });
});
