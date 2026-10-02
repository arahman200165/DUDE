import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { splitSubnet } from "@dude/tool-engine/tools/subnet-calculator/subnet-calculator-logic";

const base = fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.integer({ min: 0, max: 255 })).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}/24`);

describe('splitSubnet properties', () => {
  it('never throws for arbitrary base text, mode, and numeric parameter', () => {
    neverThrows(([text, mode, param]) => splitSubnet(text, mode, param), fc.tuple(fc.string(), fc.constantFrom('count' as const, 'newPrefix' as const), fc.double({ noNaN: true })));
  });

  it('returns contiguous aligned child networks for valid child prefixes', () => {
    invariant(([text, prefix]) => splitSubnet(text, 'newPrefix', prefix), fc.tuple(base, fc.integer({ min: 24, max: 30 })), (result) => {
      if (!result.ok || result.subnets.length === 0) return false;
      const addresses = result.subnets.map((subnet) => subnet.network.split('.').reduce((value, octet) => value * 256 + Number(octet), 0));
      const size = result.subnets[0].totalAddresses;
      return addresses.every((address, index) => address % size === 0 && (index === 0 || address === addresses[index - 1] + size));
    });
  });
});
