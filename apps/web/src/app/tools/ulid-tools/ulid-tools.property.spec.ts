import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant } from "../../../../../../tests/property-harness";
import { generateUlid, inspectUlid } from "@dude/tool-engine/tools/ulid-tools/ulid-logic";

describe('ULID properties', () => {
  it('generates inspectable 26-character Crockford identifiers', () => {
    invariant(
      (monotonic) => generateUlid(monotonic),
      fc.boolean(),
      (value) => {
        const inspected = inspectUlid(value);
        return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value) && inspected.valid && inspected.randomness?.length === 16 && inspected.timestamp instanceof Date && Number.isFinite(inspected.timestamp.getTime());
      },
    );
  });
});
