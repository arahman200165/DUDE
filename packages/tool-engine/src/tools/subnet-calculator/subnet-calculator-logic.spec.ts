import { splitSubnet } from "./subnet-calculator-logic.js";

describe('splitSubnet', () => {
  it('splits a /24 into 4 equal /26 subnets by count', () => {
    const result = splitSubnet('192.168.1.0/24', 'count', 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subnets).toHaveLength(4);
    expect(result.subnets.map((s) => s.network)).toEqual(['192.168.1.0', '192.168.1.64', '192.168.1.128', '192.168.1.192']);
    expect(result.subnets[0].prefixLength).toBe(26);
  });

  it('rounds a non-power-of-two count up to the next power of two', () => {
    const result = splitSubnet('192.168.1.0/24', 'count', 3);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.subnets).toHaveLength(4);
  });

  it('splits a /24 into subnets of a given new prefix', () => {
    const result = splitSubnet('192.168.1.0/24', 'newPrefix', 25);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subnets).toHaveLength(2);
    expect(result.subnets.map((s) => s.network)).toEqual(['192.168.1.0', '192.168.1.128']);
  });

  it('rejects a new prefix smaller than the base prefix', () => {
    expect(splitSubnet('192.168.1.0/24', 'newPrefix', 16).ok).toBe(false);
  });

  it('rejects a split that would exceed the subnet cap', () => {
    expect(splitSubnet('10.0.0.0/8', 'newPrefix', 32).ok).toBe(false);
  });

  it('rejects a missing prefix', () => {
    expect(splitSubnet('192.168.1.0', 'count', 4).ok).toBe(false);
  });

  it('rejects a malformed base address', () => {
    expect(splitSubnet('not an ip/24', 'count', 4).ok).toBe(false);
  });
});
