import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { inspectIpAddress } from "@dude/tool-engine/tools/ip-address-inspector/ip-address-inspector-logic";
import { formatIpv4, formatIpv6Compressed, parseIpv4, parseIpv6 } from "@dude/tool-engine/tools/ip-address-inspector/ip-math";

describe('inspectIpAddress properties', () => {
  it('never throws for arbitrary text', () => {
    neverThrows(inspectIpAddress, fc.string());
  });

  it('emits a canonical address that parses to the same value', () => {
    invariant(inspectIpAddress, fc.oneof(
      fc.tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.nat(255)).map((parts) => parts.join('.')),
      fc.bigInt({ min: 0n, max: (1n << 128n) - 1n }).map(formatIpv6Compressed),
    ), (result) => result !== null && (result.version === 4
      ? formatIpv4(parseIpv4(result.canonical)!) === result.canonical
      : parseIpv6(result.canonical) === parseIpv6(result.expandedOrBinary)));
  });
});
