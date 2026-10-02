import { describe, expect, it } from 'vitest';
import { canChain, compatibleTypes } from "./pipeline-compatibility.js";

describe('canChain', () => {
  it('is true when produces/accepts overlap', () => {
    expect(canChain({ accepts: ['text'], produces: ['text', 'json'] }, { accepts: ['json'], produces: ['table'] })).toBe(true);
  });

  it('is false when there is no overlap', () => {
    expect(canChain({ accepts: ['text'], produces: ['text'] }, { accepts: ['table'], produces: ['table'] })).toBe(false);
  });

  it('is false for empty produces or accepts', () => {
    expect(canChain({ accepts: ['text'], produces: [] }, { accepts: ['text'], produces: ['text'] })).toBe(false);
  });
});

describe('compatibleTypes', () => {
  it('returns the intersection of produces and accepts', () => {
    expect(compatibleTypes({ accepts: [], produces: ['text', 'json', 'file'] }, { accepts: ['json', 'table'], produces: [] })).toEqual([
      'json',
    ]);
  });

  it('returns an empty array when nothing overlaps', () => {
    expect(compatibleTypes({ accepts: [], produces: ['text'] }, { accepts: ['table'], produces: [] })).toEqual([]);
  });
});
