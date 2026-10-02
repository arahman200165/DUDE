import { describe, it, expect } from 'vitest';
import {
  uuidv7, isUuid, defaultDisplayName, validateDisplayName, decodeDeviceRecord, decodeEnvironmentRecord,
  resolveToolKeyScope, maskSecretHint, isSecretPurpose, SECRET_PURPOSES, SETTING_DEFINITIONS, findSettingDefinition,
  type DeviceRecord, type DevicePlatform,
} from './index.js';
import {
  InMemoryKeyValueRepository, InMemoryEntityCollection, InMemoryHistoryRepository, InMemoryNetworkRunRepository,
  kvRepositoryContract, entityCollectionContract, historyRepositoryContract, networkRunRepositoryContract,
  type ContractEntity,
} from './testing/index.js';

const zeros = (n: number): Uint8Array => new Uint8Array(n);
const filled = (byte: number) => (n: number): Uint8Array => new Uint8Array(n).fill(byte);

describe('uuidv7', () => {
  it('has 36 chars, version 7 and variant 10', () => {
    for (const byte of [0, 0x55, 0xff]) {
      const id = uuidv7(filled(byte), () => 1_700_000_000_000 + byte * 1000);
      expect(id).toHaveLength(36);
      expect(id[14]).toBe('7');
      expect('89ab').toContain(id[19]);
      expect(isUuid(id)).toBe(true);
    }
  });
  // Monotonic state is module-level, so tests use strictly increasing clocks.
  it('encodes the 48-bit millisecond timestamp', () => {
    const ts = 5_000_000_123_456;
    const id = uuidv7(zeros, () => ts);
    expect(parseInt(id.slice(0, 8) + id.slice(9, 13), 16)).toBe(ts);
  });
  it('orders by time and stays monotonic within one millisecond', () => {
    const ids = [
      uuidv7(zeros, () => 6_000_000_000_000), uuidv7(zeros, () => 6_000_000_000_000), uuidv7(zeros, () => 6_000_000_000_000),
      uuidv7(zeros, () => 6_000_000_000_001),
    ];
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(4);
  });
  it('rejects non-uuids', () => {
    for (const v of ['', 'x', null, 12, '00000000-0000-0000-0000-00000000000g']) expect(isUuid(v)).toBe(false);
  });
});

describe('device display name', () => {
  it('defaults by platform and never to a hostname', () => {
    const expected: Record<DevicePlatform, string> = {
      windows: 'Windows PC', macos: 'Mac', linux: 'Linux PC', web: 'Web browser', android: 'Android device', ios: 'iPhone or iPad', unknown: 'Device',
    };
    for (const [platform, name] of Object.entries(expected)) expect(defaultDisplayName(platform as DevicePlatform)).toBe(name);
  });
  it('validates length, trimming and control characters', () => {
    expect(validateDisplayName('  Desk  ')).toEqual({ ok: true, value: 'Desk' });
    expect(validateDisplayName('x'.repeat(64)).ok).toBe(true);
    for (const bad of ['', '   ', 'x'.repeat(65), 'a\nb', 'a\u0000b', 5, null]) expect(validateDisplayName(bad).ok).toBe(false);
  });
});

describe('decoders', () => {
  const device: DeviceRecord = {
    schemaVersion: 1, deviceId: 'd', displayName: 'Windows PC', platform: 'windows', os: '11', arch: 'x64', appVersion: '1.0.0',
    storeSchemaVersion: 1, capabilities: { fs: true }, hubEligible: false, enrollmentState: 'standalone',
    createdAt: '2026-01-01T00:00:00.000Z', lastStartedAt: '2026-01-02T00:00:00.000Z',
  };
  it('round-trips a valid device record', () => {
    expect(decodeDeviceRecord(device)).toEqual(device);
    expect(decodeDeviceRecord({ ...device, clonedFrom: 'old' })?.clonedFrom).toBe('old');
  });
  it('rejects garbage device records', () => {
    for (const bad of [null, 1, 'x', [], {}, { ...device, schemaVersion: 2 }, { ...device, platform: 'plan9' }, { ...device, displayName: '' },
      { ...device, capabilities: { a: 'yes' } }, { ...device, enrollmentState: 'enrolled' }, { ...device, createdAt: 'nope' }, { ...device, hubEligible: 1 }, { ...device, clonedFrom: 3 }]) {
      expect(decodeDeviceRecord(bad)).toBeNull();
    }
  });
  it('decodes environment records strictly', () => {
    const env = { environmentId: 'e', kind: 'standalone', createdAt: '2026-01-01T00:00:00.000Z' };
    expect(decodeEnvironmentRecord(env)).toEqual(env);
    for (const bad of [null, {}, { ...env, kind: 'hub' }, { ...env, environmentId: '' }, { ...env, createdAt: 'x' }]) expect(decodeEnvironmentRecord(bad)).toBeNull();
  });
});

describe('scope rules', () => {
  const table: Array<[Parameters<typeof resolveToolKeyScope>[0], string]> = [
    ['local', 'environment'], ['session', 'local-only'], ['user-choice', 'local-only'], ['none', 'local-only'], ['secure-local', 'device'],
  ];
  for (const [policy, scope] of table) it(`${policy} -> ${scope}`, () => expect(resolveToolKeyScope(policy)).toBe(scope));
  it('override wins', () => {
    expect(resolveToolKeyScope('local', { scope: 'workspace' })).toBe('workspace');
    expect(resolveToolKeyScope('none', { scope: 'device' })).toBe('device');
  });
});

describe('settings definitions and secrets', () => {
  it('declares the core settings with unique keys', () => {
    expect(new Set(SETTING_DEFINITIONS.map(d => d.key)).size).toBe(SETTING_DEFINITIONS.length);
    for (const d of SETTING_DEFINITIONS) expect(d.key).toBe(`${d.namespace}:${d.name}`);
    expect(findSettingDefinition('settings.ai', 'apiKey')).toMatchObject({ storage: 'secret', sensitivity: 'secret', scope: 'device', journal: false });
    expect(findSettingDefinition('settings', 'appearance')?.journal).toBe(true);
    expect(findSettingDefinition('nope', 'x')).toBeUndefined();
  });
  it('masks hints', () => {
    expect(maskSecretHint('sk-abcdef1234')).toBe('••••1234');
    expect(maskSecretHint('1234567')).toBe('••••');
    expect(maskSecretHint('')).toBe('••••');
  });
  it('allowlists purposes', () => {
    expect(isSecretPurpose('ai.llmApiKey')).toBe(true);
    expect(SECRET_PURPOSES['ai.llmApiKey'].consumer).toBe('main');
    for (const bad of ['toString', 'x', 1, null]) expect(isSecretPurpose(bad)).toBe(false);
  });
});

const harness = { describe, it, expect };
kvRepositoryContract('in-memory', () => new InMemoryKeyValueRepository(), harness);
entityCollectionContract('in-memory', () => new InMemoryEntityCollection<ContractEntity>(e => e.id), harness);
historyRepositoryContract('in-memory', (retention, clock) => new InMemoryHistoryRepository(retention, clock.now), harness);
networkRunRepositoryContract('in-memory', (retention, clock) => new InMemoryNetworkRunRepository(retention, clock.now), harness);
