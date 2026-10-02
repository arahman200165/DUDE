import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { generateKsuid, inspectKsuid } from "@dude/tool-engine/tools/ksuid-tools/ksuid-logic";

describe('KSUID properties', () => {
  it('generates inspectable 27-character base62 IDs for timestamps', () => {
    invariant((timestamp) => generateKsuid(timestamp), fc.integer({ min: 1_400_000_000_000, max: 4_000_000_000_000 }), (id) => /^[0-9A-Za-z]{27}$/.test(id));
  });
  it('never throws while inspecting arbitrary strings', () => {
    neverThrows(inspectKsuid, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});

