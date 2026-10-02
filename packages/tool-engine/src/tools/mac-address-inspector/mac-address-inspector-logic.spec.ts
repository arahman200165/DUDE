import { inspectMac } from "./mac-address-inspector-logic.js";

describe('inspectMac', () => {
  it('normalizes a colon-separated address into every format', () => {
    const result = inspectMac('00:1B:63:aa:bb:cc');
    expect(result).toMatchObject({
      colon: '00:1B:63:AA:BB:CC',
      hyphen: '00-1B-63-AA-BB-CC',
      ciscoDotted: '001b.63aa.bbcc',
      plain: '001B63AABBCC',
    });
  });

  it('accepts a hyphen-separated address', () => {
    expect(inspectMac('00-1B-63-AA-BB-CC')?.colon).toBe('00:1B:63:AA:BB:CC');
  });

  it('accepts a Cisco-dotted address', () => {
    expect(inspectMac('001b.63aa.bbcc')?.colon).toBe('00:1B:63:AA:BB:CC');
  });

  it('accepts a plain unseparated address', () => {
    expect(inspectMac('001B63AABBCC')?.colon).toBe('00:1B:63:AA:BB:CC');
  });

  it('looks up a known vendor OUI', () => {
    expect(inspectMac('00:1B:63:AA:BB:CC')?.vendor).toBe('Apple');
  });

  it('leaves vendor undefined for an unrecognized OUI', () => {
    expect(inspectMac('AA:BB:CC:11:22:33')?.vendor).toBeUndefined();
  });

  it('detects the well-known IPv4 multicast MAC prefix', () => {
    const result = inspectMac('01:00:5E:00:00:01');
    expect(result?.isMulticast).toBe(true);
  });

  it('detects a unicast address', () => {
    const result = inspectMac('00:1B:63:AA:BB:CC');
    expect(result?.isMulticast).toBe(false);
  });

  it('detects a locally-administered address', () => {
    const result = inspectMac('02:00:00:00:00:01');
    expect(result?.isLocallyAdministered).toBe(true);
  });

  it('detects a universally-administered address', () => {
    const result = inspectMac('00:1B:63:AA:BB:CC');
    expect(result?.isLocallyAdministered).toBe(false);
  });

  it('returns null for malformed input', () => {
    expect(inspectMac('not a mac')).toBeNull();
    expect(inspectMac('00:1B:63:AA:BB')).toBeNull();
  });
});
