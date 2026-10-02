const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  ready: true,
  encryption: true,
  rows: new Map<string, { ciphertext: Uint8Array; needsReentry: boolean }>(),
  calls: [] as string[],
}));

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
  safeStorage: {
    isEncryptionAvailable: () => mock.encryption,
    // Reversible stand-in: the "ciphertext" is the reversed UTF-8 bytes behind a marker.
    encryptString: (value: string) => Buffer.concat([Buffer.from('enc:'), Buffer.from(value, 'utf8').reverse()]),
    decryptString: (buffer: Buffer) => {
      if (!buffer.subarray(0, 4).equals(Buffer.from('enc:'))) throw new Error('cannot decrypt');
      return Buffer.from(buffer.subarray(4)).reverse().toString('utf8');
    },
  },
}));

vi.mock('./device-store/store-client', () => ({
  isDeviceStoreReady: () => mock.ready,
  storeCall: async (method: string, params: any) => {
    mock.calls.push(method);
    const row = mock.rows.get(params.purpose);
    switch (method) {
      case 'secrets.status': return { purpose: params.purpose, isSet: !!row, needsReentry: row?.needsReentry ?? false, createdAt: null, lastUsedAt: null };
      case 'secrets.getCiphertext': return { ciphertext: row?.ciphertext ?? null };
      case 'secrets.set': mock.rows.set(params.purpose, { ciphertext: params.ciphertext, needsReentry: false }); return {};
      case 'secrets.remove': mock.rows.delete(params.purpose); return {};
      default: throw new Error(`unexpected ${method}`);
    }
  },
}));

import { getSecretValue, registerSecretsHandlers, removeSecret, secretStatus, setSecretValue } from './secrets-bridge';

const PURPOSE = 'ai.llmApiKey';
const KEY = 'sk-live-0123456789abcd';

describe('secrets bridge', () => {
  const webContents = {};
  const window = { webContents };
  const call = (channel: string, sender: unknown, ...args: unknown[]) => mock.handlers.get(channel)!({ sender }, ...args) as Promise<any>;

  beforeEach(() => {
    mock.handlers.clear();
    mock.rows.clear();
    mock.calls = [];
    mock.ready = true;
    mock.encryption = true;
    registerSecretsHandlers(window as never);
  });

  it('registers status, set and remove, and no channel that returns a value', () => {
    expect([...mock.handlers.keys()].sort()).toEqual(['dude:secrets:remove', 'dude:secrets:set', 'dude:secrets:status']);
    expect(mock.handlers.has('dude:secrets:get')).toBe(false);
  });

  it.each([
    ['dude:secrets:status', [PURPOSE]],
    ['dude:secrets:set', [PURPOSE, KEY]],
    ['dude:secrets:remove', [PURPOSE]],
  ])('rejects a foreign sender on %s without touching the store', async (channel, args) => {
    const result = await call(channel, {}, ...args);
    expect(JSON.stringify(result)).toContain('rejected');
    expect(mock.calls).toEqual([]);
    expect(mock.rows.size).toBe(0);
  });

  it('rejects an unknown purpose on every channel', async () => {
    expect(await call('dude:secrets:set', webContents, 'ai.other', KEY)).toEqual({ ok: false, error: 'unknown-purpose' });
    expect(await call('dude:secrets:remove', webContents, '__proto__')).toEqual({ ok: false, error: 'unknown-purpose' });
    expect(await call('dude:secrets:status', webContents, 'constructor')).toMatchObject({ isSet: false, error: 'rejected' });
    expect(mock.calls).toEqual([]);
  });

  it.each([['empty', ''], ['oversize', 'x'.repeat(4097)], ['number', 5], ['object', { a: 1 }], ['null', null]])('rejects an invalid value: %s', async (_name, value) => {
    expect(await call('dude:secrets:set', webContents, PURPOSE, value)).toEqual({ ok: false, error: 'invalid-value' });
    expect(mock.rows.size).toBe(0);
  });

  it('accepts a value at the maximum length', async () => {
    expect(await call('dude:secrets:set', webContents, PURPOSE, 'x'.repeat(4096))).toEqual({ ok: true });
  });

  it('refuses to store when encryption is unavailable, never persisting plaintext', async () => {
    mock.encryption = false;
    expect(await call('dude:secrets:set', webContents, PURPOSE, KEY)).toEqual({ ok: false, error: 'encryption-unavailable' });
    expect(mock.rows.size).toBe(0);
    expect(mock.calls).not.toContain('secrets.set');
  });

  it('refuses writes and reports store-unavailable when the store is not ready', async () => {
    mock.ready = false;
    expect(await call('dude:secrets:set', webContents, PURPOSE, KEY)).toEqual({ ok: false, error: 'store-unavailable' });
    expect(await call('dude:secrets:remove', webContents, PURPOSE)).toEqual({ ok: false, error: 'store-unavailable' });
    expect(await call('dude:secrets:status', webContents, PURPOSE)).toMatchObject({ isSet: false, hint: null, error: 'store-unavailable' });
    expect(await getSecretValue(PURPOSE)).toBeNull();
  });

  it('round-trips through the store as ciphertext only, and getSecretValue decrypts in main', async () => {
    expect(await call('dude:secrets:set', webContents, PURPOSE, KEY)).toEqual({ ok: true });
    const stored = mock.rows.get(PURPOSE)!.ciphertext;
    expect(Buffer.from(stored).toString('utf8')).not.toContain(KEY);
    expect(await getSecretValue(PURPOSE)).toBe(KEY);
    expect(await setSecretValue(PURPOSE, 'other-secret-value')).toEqual({ ok: true });
    expect(await getSecretValue(PURPOSE)).toBe('other-secret-value');
    expect(await removeSecret(PURPOSE)).toEqual({ ok: true });
    expect(await getSecretValue(PURPOSE)).toBeNull();
  });

  it('status carries a masked hint that never contains the value', async () => {
    await call('dude:secrets:set', webContents, PURPOSE, KEY);
    const status = await call('dude:secrets:status', webContents, PURPOSE);
    expect(status).toEqual({ purpose: PURPOSE, isSet: true, hint: '••••abcd', needsReentry: false });
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(JSON.stringify(status)).not.toContain('sk-live');
  });

  it('a short value reveals nothing in the hint', async () => {
    await call('dude:secrets:set', webContents, PURPOSE, 'abc');
    expect((await call('dude:secrets:status', webContents, PURPOSE)).hint).toBe('••••');
  });

  it('propagates needsReentry from the store without a hint', async () => {
    await call('dude:secrets:set', webContents, PURPOSE, KEY);
    mock.rows.get(PURPOSE)!.needsReentry = true;
    expect(await secretStatus(PURPOSE)).toEqual({ purpose: PURPOSE, isSet: true, hint: null, needsReentry: true });
  });

  it('treats an undecryptable value as needing re-entry', async () => {
    mock.rows.set(PURPOSE, { ciphertext: new Uint8Array([1, 2, 3, 4, 5]), needsReentry: false });
    expect(await secretStatus(PURPOSE)).toEqual({ purpose: PURPOSE, isSet: true, hint: null, needsReentry: true });
    expect(await getSecretValue(PURPOSE)).toBeNull();
  });

  it('reports an unset secret', async () => {
    expect(await secretStatus(PURPOSE)).toEqual({ purpose: PURPOSE, isSet: false, hint: null, needsReentry: false });
  });
});
