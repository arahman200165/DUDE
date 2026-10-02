import { describe, expect, it } from 'vitest';
import { expandScanTargets, validateNetworkRequest } from './network-validation';

describe('network request limits', () => {
  it('expands exact IPv4 and IPv6 ranges and rejects more than 16 addresses', () => {
    expect(expandScanTargets('192.0.2.5/30')).toEqual(['192.0.2.4', '192.0.2.5', '192.0.2.6', '192.0.2.7']);
    expect(expandScanTargets('2001:db8::5/126')).toHaveLength(4);
    expect(() => expandScanTargets('192.0.2.1/27')).toThrow('at most 16');
    expect(() => expandScanTargets('2001:db8::1/123')).toThrow('at most 16');
  });

  it('checks the scan probe budget in main-process validation', () => {
    expect(() => validateNetworkRequest({ kind: 'port-scanner', target: '192.0.2.0/28', ports: Array.from({ length: 33 }, (_, i) => i + 1), protocol: 'both' })).toThrow('1,024 probes');
    expect(() => validateNetworkRequest({ kind: 'port-scanner', target: '192.0.2.0/28', ports: Array.from({ length: 65 }, (_, i) => i + 1) })).toThrow('1 to 64');
    expect(validateNetworkRequest({ kind: 'port-scanner', target: '192.0.2.0/28', ports: Array.from({ length: 64 }, (_, i) => i + 1), protocol: 'tcp' }).kind).toBe('port-scanner');
  });

  it('rejects invalid HTTP requests before sockets are opened', () => {
    expect(() => validateNetworkRequest({ kind: 'connectivity-tester', target: 'https://user:password@example.com', connectivityMode: 'http' })).toThrow();
    expect(() => validateNetworkRequest({ kind: 'connectivity-tester', target: 'https://example.com', connectivityMode: 'http', body: 'x'.repeat(1_000_001) })).toThrow('1 MB');
    expect(() => validateNetworkRequest({ kind: 'connectivity-tester', target: 'https://example.com', connectivityMode: 'http', headers: { X: 'yes\r\nInjected: value' } })).toThrow('headers');
  });

  it('rejects invalid timing and reverse DNS input', () => {
    expect(() => validateNetworkRequest({ kind: 'latency-monitor', target: 'example.com', intervalMs: 1 })).toThrow('interval');
    expect(() => validateNetworkRequest({ kind: 'reverse-dns', target: 'example.com' })).toThrow('IP address');
  });
});
