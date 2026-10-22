import { describe, expect, it } from 'vitest';
import { MAX_INPUT_BYTES as HASH_MAX } from '../hash/hash-mobile';
import { MAX_INPUT_BYTES as JSON_MAX } from '../json/json-mobile';
import { MAX_INPUT_BYTES as YAML_MAX } from '../yaml-json/yaml-json-mobile';
import { MAX_INPUT_CHARS as CSV_MAX } from '../csv-viewer/csv-viewer-mobile';
import { MAX_SIDE_CHARS as DIFF_MAX } from '../diff/diff-mobile';
import { MAX_TEXT_LENGTH as REGEX_MAX } from '../regex/regex-mobile';
import { CSV_CAP, DIFF_SIDE_CAP, HASH_CAP, JSON_CAP, REGEX_CAP, YAML_CAP, csvText, diffTexts, jsonText, proseText, sizeAt, xmlText, yamlText } from './measure-data';

describe('measurement inputs', () => {
  it('use ceilings at or above the live tool caps, which carry the measured budgets', () => {
    const live = [HASH_MAX, JSON_MAX, YAML_MAX, CSV_MAX, DIFF_MAX, REGEX_MAX];
    const ceilings = [HASH_CAP, JSON_CAP, YAML_CAP, CSV_CAP, DIFF_SIDE_CAP, REGEX_CAP];
    live.forEach((cap, index) => expect(cap).toBeLessThanOrEqual(ceilings[index]!));
    expect(live).toEqual([128 * 1024, 2 * 1024 * 1024, 2 * 1024 * 1024, 384 * 1024, 512 * 1024, 64 * 1024]);
  });
  it('are deterministic, ASCII and within the requested size', () => {
    const limit = 40_000;
    for (const make of [() => proseText(limit), () => jsonText(limit), () => yamlText(limit), () => xmlText(limit), () => csvText(limit)]) {
      const text = make();
      expect(text).toBe(make());
      expect(text.length).toBeLessThanOrEqual(limit);
      expect(text.length).toBeGreaterThan(limit * 0.95);
      expect(/^[\x00-\x7f]*$/.test(text)).toBe(true);
    }
    expect(() => JSON.parse(jsonText(limit))).not.toThrow();
    const { left, right } = diffTexts(limit);
    expect(left.length).toBeLessThanOrEqual(limit);
    expect(right.length).toBeLessThanOrEqual(limit);
    expect(right).not.toBe(left);
  });
  it('sizes a percentage of the cap', () => expect([25, 50, 100].map(percent => sizeAt(JSON_CAP, percent))).toEqual([524288, 1048576, 2097152]));
});
