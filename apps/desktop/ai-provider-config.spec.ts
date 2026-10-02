const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  doc: null as unknown,
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));
vi.mock('./device-store/device-docs', () => ({
  loadDoc: async (_name: string, decode: (raw: unknown) => unknown, fallback: unknown) => (mock.doc === null ? fallback : decode(mock.doc) ?? fallback),
  saveDoc: async (_name: string, value: unknown) => { mock.doc = value; },
}));
vi.mock('./secrets-bridge', () => ({
  secretStatus: async () => ({ purpose: 'ai.llmApiKey', isSet: true, hint: '••••abcd', needsReentry: false }),
}));

import { parseAiProviderPatch, registerAiProviderHandlers } from './ai-provider-config';

describe('ai provider config IPC', () => {
  const webContents = {};
  const call = (channel: string, sender: unknown, ...args: unknown[]) => mock.handlers.get(channel)!({ sender }, ...args) as Promise<any>;

  beforeEach(() => {
    mock.handlers.clear();
    mock.doc = null;
    registerAiProviderHandlers({ webContents } as never);
  });

  it('rejects a foreign sender on both channels', async () => {
    expect(await call('dude:ai:getConfig', {})).toBeNull();
    expect(await call('dude:ai:setConfig', {}, { model: 'x' })).toEqual({ ok: false, error: 'rejected' });
    expect(mock.doc).toBeNull();
  });

  it('returns the stored config with only the key status, never a key', async () => {
    await call('dude:ai:setConfig', webContents, { baseUrl: 'https://api.example.com/v1', model: 'gpt-test' });
    const view = await call('dude:ai:getConfig', webContents);
    expect(view).toEqual({ baseUrl: 'https://api.example.com/v1', model: 'gpt-test', apiKey: { purpose: 'ai.llmApiKey', isSet: true, hint: '••••abcd', needsReentry: false } });
  });

  it('merges a partial patch', async () => {
    await call('dude:ai:setConfig', webContents, { baseUrl: 'https://a.example/v1', model: 'm1' });
    await call('dude:ai:setConfig', webContents, { model: 'm2' });
    expect(mock.doc).toEqual({ baseUrl: 'https://a.example/v1', model: 'm2' });
  });

  it.each([
    ['non-object', 'x'], ['array', []], ['extra key', { baseUrl: 'https://a.example', apiKey: 'sk' }],
    ['ftp url', { baseUrl: 'ftp://a.example' }], ['javascript url', { baseUrl: 'javascript:alert(1)' }], ['not a url', { baseUrl: 'nope' }],
    ['oversize url', { baseUrl: `https://a.example/${'x'.repeat(2048)}` }], ['oversize model', { model: 'm'.repeat(201) }], ['number model', { model: 5 }],
  ])('rejects an invalid patch: %s', async (_name, payload) => {
    expect(await call('dude:ai:setConfig', webContents, payload)).toEqual({ ok: false, error: 'invalid-config' });
    expect(mock.doc).toBeNull();
  });

  it('accepts an empty base URL to clear it', () => {
    expect(parseAiProviderPatch({ baseUrl: '', model: '' })).toEqual({ baseUrl: '', model: '' });
  });
});
