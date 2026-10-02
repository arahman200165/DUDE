import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../tests/property-harness";
import { findYamlAnchors } from "./yaml-anchors-transform.js";

describe('YAML anchor properties', () => {
  it('discovers generated anchor and alias pairs', () => {
    invariant((value) => findYamlAnchors(`base: &shared ${JSON.stringify(value)}\ncopy: *shared`), fc.string({ maxLength: 20 }), (result) => {
      expect(result.ok).toBe(true);
      return result.ok && result.anchors.some((entry) => entry.anchor === 'shared' && entry.aliasPaths.length === 1);
    });
  });
});
