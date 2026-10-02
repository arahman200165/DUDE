import { convertIpv4Integer } from "./ipv4-integer-converter-logic.js";

describe('convertIpv4Integer', () => {
  it('converts an IP to its integer form', () => {
    expect(convertIpv4Integer('192.168.1.1', 'ip-to-int')).toEqual({ ok: true, output: '3232235777' });
  });

  it('converts an integer to its IP form', () => {
    expect(convertIpv4Integer('3232235777', 'int-to-ip')).toEqual({ ok: true, output: '192.168.1.1' });
  });

  it('round-trips 0 and the max value', () => {
    expect(convertIpv4Integer('0.0.0.0', 'ip-to-int')).toEqual({ ok: true, output: '0' });
    expect(convertIpv4Integer('255.255.255.255', 'ip-to-int')).toEqual({ ok: true, output: '4294967295' });
  });

  it('rejects a malformed IP', () => {
    expect(convertIpv4Integer('not an ip', 'ip-to-int').ok).toBe(false);
  });

  it('rejects an out-of-range integer', () => {
    expect(convertIpv4Integer('4294967296', 'int-to-ip').ok).toBe(false);
  });

  it('rejects a non-integer', () => {
    expect(convertIpv4Integer('abc', 'int-to-ip').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(convertIpv4Integer('', 'ip-to-int').ok).toBe(false);
    expect(convertIpv4Integer('', 'int-to-ip').ok).toBe(false);
  });
});
