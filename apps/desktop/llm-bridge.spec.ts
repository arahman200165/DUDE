const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  secrets: {} as Record<string, string | null>,
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
}));
vi.mock('./secrets-bridge', () => ({
  getSecretValue: async (key: string) => mock.secrets[key] ?? null,
}));

import { registerLlmHandlers } from './llm-bridge';

const API_KEY = 'sk-super-secret-key';

describe('dude:llm:chat', () => {
  const webContents = {};
  const window = { webContents };
  const fetchMock = vi.fn();
  const good = { messages: [{ role: 'user', content: 'hi' }] };

  function chat(payload: unknown, sender: unknown = webContents) {
    return mock.handlers.get('dude:llm:chat')!({ sender }, payload) as Promise<{ ok: boolean; content?: string; error?: string }>;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    mock.secrets = {
      'dude:v1:settings:llmBaseUrl': 'https://api.example.com/v1/',
      'dude:v1:settings:llmModel': 'gpt-test',
      'dude:v1:settings:llmApiKey': API_KEY,
    };
    registerLlmHandlers(window as never);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('rejects requests from another sender without calling the provider', async () => {
    await expect(chat(good, {})).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['non-object', 'hi'],
    ['null', null],
    ['non-array messages', { messages: 'hi' }],
    ['empty messages', { messages: [] }],
    ['bad role', { messages: [{ role: 'tool', content: 'x' }] }],
    ['non-string content', { messages: [{ role: 'user', content: 5 }] }],
    ['extra payload key', { messages: [{ role: 'user', content: 'x' }], model: 'evil' }],
    ['extra message key', { messages: [{ role: 'user', content: 'x', name: 'n' }] }],
    ['too many messages', { messages: Array.from({ length: 201 }, () => ({ role: 'user', content: 'x' })) }],
    ['oversize content', { messages: [{ role: 'user', content: 'x'.repeat(1024 * 1024 + 1) }] }],
    ['oversize total', { messages: [{ role: 'user', content: 'x'.repeat(600_000) }, { role: 'user', content: 'x'.repeat(600_000) }] }],
  ])('rejects an invalid payload: %s', async (_name, payload) => {
    await expect(chat(payload)).resolves.toMatchObject({ ok: false, error: 'Invalid chat request.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports not-configured when no key is stored', async () => {
    mock.secrets = {};
    await expect(chat(good)).resolves.toEqual({ ok: false, error: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards to the provider with the key in the header and returns only the content', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'hello there' } }], id: 'x' }), { status: 200 }));
    const result = await chat({ messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'hi' }, { role: 'assistant', content: 'a' }] });

    expect(result).toEqual({ ok: true, content: 'hello there' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-test', stream: false });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('maps a provider HTTP error to an error without leaking the key', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${API_KEY}` } }), { status: 401 }));
    const result = await chat(good);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('maps a network failure to an error without leaking the key', async () => {
    fetchMock.mockRejectedValue(new Error(`connect failed for Bearer ${API_KEY}`));
    const result = await chat(good);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('reports an unexpected response shape', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ nope: true }), { status: 200 }));
    await expect(chat(good)).resolves.toMatchObject({ ok: false });
  });

  it('answers isConfigured only for the trusted renderer', async () => {
    const isConfigured = mock.handlers.get('dude:llm:isConfigured')!;
    await expect(isConfigured({ sender: webContents })).resolves.toBe(true);
    await expect(isConfigured({ sender: {} })).resolves.toBe(false);
  });

  it('no longer registers a getEndpoint channel', () => {
    expect(mock.handlers.has('dude:llm:getEndpoint')).toBe(false);
  });
});
