import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import {
  DEVICE_CAPABILITIES, DeviceSelfUpdate, EnrollRequest, deviceAuthMessage, displayPairingCode, enrollMessage, formatPairingString, normalizePairingCode,
  parsePairingString,
} from './devices.schema.js';

const spki = 'A'.repeat(43);

describe('pairing string', () => {
  it('round-trips hostnames, IPv4 and IPv6 literals', () => {
    for (const host of ['hub.example.com', '192.168.1.20', 'localhost', '[::1]', '[fe80::1]']) {
      const text = formatPairingString({ host, port: 8443, code: 'ABCD-EFGH', spkiSha256: spki });
      expect(text).toBe(`dude-pair:v1:${host}:8443:ABCDEFGH:${spki}`);
      expect(parsePairingString(text)).toEqual({ host, port: 8443, code: 'ABCDEFGH', spkiSha256: spki });
    }
  });

  it('brackets a bare IPv6 literal and normalizes the code', () => {
    expect(formatPairingString({ host: '::1', port: 1, code: 'abcd-efgh', spkiSha256: spki })).toBe(`dude-pair:v1:[::1]:1:ABCDEFGH:${spki}`);
    expect(normalizePairingCode('ab1o-ilzz')).toBe('AB10' + '11ZZ');
    expect(displayPairingCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it.each([
    ['empty', ''],
    ['wrong prefix', `dude-pair:v2:h:1:ABCDEFGH:${spki}`],
    ['port zero', `dude-pair:v1:h:0:ABCDEFGH:${spki}`],
    ['port too large', `dude-pair:v1:h:65536:ABCDEFGH:${spki}`],
    ['dashed code', `dude-pair:v1:h:1:ABCD-EFGH:${spki}`],
    ['code with U', `dude-pair:v1:h:1:ABCDEFGU:${spki}`],
    ['short pin', `dude-pair:v1:h:1:ABCDEFGH:${'A'.repeat(42)}`],
    ['unbracketed IPv6', `dude-pair:v1:::1:1:ABCDEFGH:${spki}`],
    ['unclosed bracket', `dude-pair:v1:[::1:1:ABCDEFGH:${spki}`],
    ['trailing field', `dude-pair:v1:h:1:ABCDEFGH:${spki}:x`],
    ['host with slash', `dude-pair:v1:h/x:1:ABCDEFGH:${spki}`],
  ])('rejects %s', (_name, text) => {
    expect(parsePairingString(text)).toBeNull();
  });
});

describe('signed messages and schemas', () => {
  it('builds the canonical messages', () => {
    expect(enrollMessage({ hubInstanceId: 'h', pairingCode: 'abcd-efgh', deviceId: 'd', publicKey: 'k' })).toBe('dude-enroll:v1|h|ABCDEFGH|d|k');
    expect(deviceAuthMessage({ hubInstanceId: 'h', nonce: 'n', deviceId: 'd' })).toBe('dude-device-auth:v1|h|n|d');
  });

  it('has unique capabilities within the request limit', () => {
    expect(new Set(DEVICE_CAPABILITIES).size).toBe(DEVICE_CAPABILITIES.length);
    expect(DEVICE_CAPABILITIES.length).toBeLessThanOrEqual(16);
    expect(DEVICE_CAPABILITIES).toEqual(expect.arrayContaining(['secure-storage', 'filesystem', 'windows-system', 'network-tools', 'local-ai', 'collab-host', 'hub-host']));
  });

  it('validates an enroll request', () => {
    const ok = {
      pairingCode: 'ABCD-EFGH',
      device: { deviceId: '123e4567-e89b-42d3-a456-426614174000', displayName: 'Laptop', platform: 'windows', appVersion: '1.0.0', protocolVersion: 1, capabilities: ['desktop'] },
      publicKey: 'A'.repeat(43), signature: 'A'.repeat(86),
    };
    expect(Value.Check(EnrollRequest, ok)).toBe(true);
    expect(Value.Check(EnrollRequest, { ...ok, device: { ...ok.device, capabilities: ['desktop', 'desktop'] } })).toBe(false);
    expect(Value.Check(EnrollRequest, { ...ok, device: { ...ok.device, capabilities: ['teleport'] } })).toBe(false);
    expect(Value.Check(EnrollRequest, { ...ok, device: { ...ok.device, platform: 'plan9' } })).toBe(false);
    expect(Value.Check(EnrollRequest, { ...ok, publicKey: 'short' })).toBe(false);
    expect(Value.Check(DeviceSelfUpdate, { displayName: '' })).toBe(false);
    expect(Value.Check(DeviceSelfUpdate, {})).toBe(true);
  });
});
