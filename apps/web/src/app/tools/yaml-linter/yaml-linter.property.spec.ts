import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { lintYaml } from "@dude/tool-engine/tools/yaml-linter/yaml-lint";

describe('YAML linter properties', () => {
  it('returns a shaped success or diagnostic for arbitrary input', () => {
    neverThrows(lintYaml, fc.string(), { assertShape: (result) => expect(typeof result).toBe('object') });
  });
});
