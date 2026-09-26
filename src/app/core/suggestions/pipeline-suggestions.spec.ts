import { describe, expect, it } from 'vitest';
import { UsageLogEntry } from '../usage/usage.model';
import { findPipelineSuggestions, suggestionKey } from './pipeline-suggestions';

function entry(toolId: string, minutesFromEpoch: number): UsageLogEntry {
  return { toolId, at: new Date(minutesFromEpoch * 60_000).toISOString() };
}

const ELIGIBLE = new Set(['base64', 'json', 'hash']);

describe('findPipelineSuggestions', () => {
  it('finds no suggestion below the occurrence threshold', () => {
    const twice = [entry('base64', 0), entry('json', 1), entry('base64', 10), entry('json', 11)];
    expect(findPipelineSuggestions(twice, ELIGIBLE, 5)).toEqual([]);
  });

  it('surfaces a pair repeated at least 3 times within the gap window', () => {
    const log = [
      entry('base64', 0),
      entry('json', 1),
      entry('base64', 10),
      entry('json', 11),
      entry('base64', 20),
      entry('json', 21),
    ];
    const result = findPipelineSuggestions(log, ELIGIBLE, 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ toolIds: ['base64', 'json'], occurrences: 3 });
  });

  it('excludes a sequence containing a pipeline-ineligible tool', () => {
    const log = [
      entry('base64', 0),
      entry('diff', 1),
      entry('base64', 10),
      entry('diff', 11),
      entry('base64', 20),
      entry('diff', 21),
    ];
    expect(findPipelineSuggestions(log, ELIGIBLE, 5)).toEqual([]);
  });

  it('does not count a pair whose opens are farther apart than the gap window', () => {
    const log = [
      entry('base64', 0),
      entry('json', 100), // 100 minutes later, well past the 10-minute gap window
      entry('base64', 200),
      entry('json', 201),
      entry('base64', 202),
      entry('json', 203),
    ];
    const result = findPipelineSuggestions(log, ELIGIBLE, 5);
    // Only the second and third repeats (adjacent, within the gap window) should count -- 2 occurrences, below threshold.
    expect(result).toEqual([]);
  });

  it('collapses consecutive re-opens of the same tool before scanning', () => {
    const log = [
      entry('base64', 0),
      entry('base64', 1), // immediate re-open, should not count as a new "step"
      entry('json', 2),
      entry('base64', 10),
      entry('json', 11),
      entry('base64', 20),
      entry('json', 21),
    ];
    const result = findPipelineSuggestions(log, ELIGIBLE, 5);
    expect(result[0]).toEqual({ toolIds: ['base64', 'json'], occurrences: 3 });
  });

  it('respects the limit and ranks by occurrences then sequence length', () => {
    const log = [
      entry('base64', 0),
      entry('json', 1),
      entry('base64', 10),
      entry('json', 11),
      entry('base64', 20),
      entry('json', 21),
      entry('base64', 30),
      entry('hash', 31),
      entry('base64', 40),
      entry('hash', 41),
      entry('base64', 50),
      entry('hash', 51),
      entry('base64', 60),
      entry('hash', 61),
    ];
    const result = findPipelineSuggestions(log, ELIGIBLE, 1);
    expect(result).toHaveLength(1);
    expect(result[0].toolIds).toEqual(['base64', 'hash']);
    expect(result[0].occurrences).toBe(4);
  });
});

describe('suggestionKey', () => {
  it('produces a stable, order-sensitive key', () => {
    expect(suggestionKey(['base64', 'json'])).toBe('base64>json');
    expect(suggestionKey(['json', 'base64'])).toBe('json>base64');
  });
});
