import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { validateCompose } from "@dude/tool-engine/tools/docker-compose-validator/docker-compose-validator-logic";

describe('docker-compose-validator properties', () => {
  it('returns a result for arbitrary YAML text', () => {
    neverThrows(validateCompose, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});
