import { describe, expect, it } from 'vitest';
import { isSyncableSettingKey } from './syncable-key.js';
import { settingCodec } from '../codecs/setting.codec.js';

const tools = [
  { id: 'base64', persistence: { input: 'session', preferences: 'local' } },
  { id: 'scoped', persistence: { preferences: 'local' }, settingScopes: { dev: { scope: 'device' }, env: { scope: 'environment' } } },
  { id: 'secure', persistence: { preferences: 'secure-local' } },
  { id: 'none' },
] as const;

describe('isSyncableSettingKey', () => {
  it('accepts core environment kv settings', () => {
    expect(isSyncableSettingKey('settings', 'appearance', [])).toBe(true);
    expect(isSyncableSettingKey('__workspace__', 'reopenOnRestart', [])).toBe(true);
  });
  it('rejects core device settings', () => {
    expect(isSyncableSettingKey('settings.ai', 'baseUrl', [])).toBe(false);
    expect(isSyncableSettingKey('settings.ai', 'apiKey', [])).toBe(false);
  });
  it('accepts local tool preferences, honouring settingScopes', () => {
    expect(isSyncableSettingKey('base64', 'wrap', tools)).toBe(true);
    expect(isSyncableSettingKey('scoped', 'env', tools)).toBe(true);
    expect(isSyncableSettingKey('scoped', 'dev', tools)).toBe(false);
    expect(isSyncableSettingKey('scoped', 'other', tools)).toBe(true);
  });
  it('rejects other policies, unknown namespaces', () => {
    expect(isSyncableSettingKey('secure', 'k', tools)).toBe(false);
    expect(isSyncableSettingKey('none', 'k', tools)).toBe(false);
    expect(isSyncableSettingKey('mystery', 'k', tools)).toBe(false);
  });
});

describe('settingCodec', () => {
  it('round-trips and validates', () => {
    const v = { namespace: 'base64', key: 'wrap', value: { a: [1, null] } };
    expect(settingCodec.idOf(v)).toBe('base64:wrap');
    expect(settingCodec.decode(JSON.parse(JSON.stringify(settingCodec.encode(v))), undefined)).toEqual(v);
    expect(settingCodec.decode({ namespace: 'a', key: 'b', value: null }, undefined)).toEqual({ namespace: 'a', key: 'b', value: null });
    for (const bad of [null, [], {}, { namespace: 'a', key: 'b' }, { namespace: '', key: 'b', value: 1 }, { namespace: 'a', key: 5, value: 1 }]) {
      expect(settingCodec.decode(bad, undefined)).toBeNull();
    }
  });
});
