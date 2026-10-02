import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { convertProperties } from "@dude/tool-engine/tools/properties-parser/properties-convert";

describe('properties conversion properties', () => {
  it('round-trips arbitrary nonempty flat string maps through JSON and properties', () => {
    invariant((value: Record<string, string>) => {
      const properties = convertProperties(JSON.stringify(value), 'json-to-properties');
      if (!properties.ok) return null;
      const json = convertProperties(properties.output, 'properties-to-json');
      return json.ok ? JSON.parse(json.output) as Record<string, string> : null;
    }, fc.dictionary(fc.stringMatching(/^[a-zA-Z]{1,16}$/), fc.string(), { minKeys: 1, maxKeys: 10 }), (result, value) => {
      expect(result).toEqual(value);
      return true;
    });
  });

  it('never throws for arbitrary text in either direction', () => {
    neverThrows((input: string) => [convertProperties(input, 'properties-to-json'), convertProperties(input, 'json-to-properties')],
      fc.string(), { assertShape: (result) => expect(Array.isArray(result)).toBe(true) });
  });
});
