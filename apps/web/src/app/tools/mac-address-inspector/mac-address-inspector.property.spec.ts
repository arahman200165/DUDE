import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { inspectMac } from "@dude/tool-engine/tools/mac-address-inspector/mac-address-inspector-logic";

const hex = fc.array(fc.constantFrom(...'0123456789abcdef'), { minLength: 12, maxLength: 12 }).map((chars) => chars.join(''));

describe('inspectMac properties', () => {
  it('never throws for arbitrary text', () => {
    neverThrows(inspectMac, fc.string());
  });

  it('normalizes each valid address into equivalent 12-digit formats', () => {
    invariant(inspectMac, hex, (result, input) => result !== null && result.plain === input.toUpperCase() && result.colon.replaceAll(':', '') === result.plain && result.hyphen.replaceAll('-', '') === result.plain && result.ciscoDotted.replaceAll('.', '').toUpperCase() === result.plain);
  });
});
