import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { processToml } from "@dude/tool-engine/tools/toml-formatter/toml-format";

describe('TOML formatter properties', () => {
  it('formats generated basic assignments into parseable TOML', () => {
    const arb = fc.tuple(fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,10}$/), fc.integer());
    invariant(([key, value]) => processToml(`${key} = ${value}`, 'format'), arb, (result) => {
      expect(result.ok).toBe(true);
      return result.ok && processToml(result.output, 'validate').ok;
    });
  });
});
