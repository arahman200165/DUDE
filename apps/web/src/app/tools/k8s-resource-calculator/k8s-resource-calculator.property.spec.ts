import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { calculateResourceRequests } from "@dude/tool-engine/tools/k8s-resource-calculator/k8s-resource-calculator-logic";

describe('k8s-resource-calculator properties', () => {
  it('never throws for arbitrary YAML input', () => {
    neverThrows(calculateResourceRequests, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});
