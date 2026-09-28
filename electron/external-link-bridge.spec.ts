const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  openExternal: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => unknown) => mock.handlers.set(channel, handler) },
  shell: { openExternal: mock.openExternal },
}));

import { normalizeExternalUrl, registerExternalLinkHandlers } from './external-link-bridge';

describe('normalizeExternalUrl', () => {
  it('accepts http and https and returns the normalized href', () => {
    expect(normalizeExternalUrl(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1');
    expect(normalizeExternalUrl('http://localhost:4200')).toBe('http://localhost:4200/');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'file:///C:/Windows/System32/calc.exe',
    'ms-settings:defaultapps',
    'vscode://file/C:/x',
    'ftp://example.com',
    'mailto:a@b.co',
    '\\\\server\\share\\file',
    '//example.com',
    'example.com',
    'https://',
    'https://user:pass@example.com',
    'https://user@example.com',
    '',
    `https://example.com/${'a'.repeat(2048)}`,
  ])('refuses %s', (value) => {
    expect(normalizeExternalUrl(value)).toBeNull();
  });

  it('refuses non-strings', () => {
    for (const value of [undefined, null, 42, {}, ['https://example.com']]) expect(normalizeExternalUrl(value)).toBeNull();
  });
});

describe('dude:external:open', () => {
  const webContents = {};
  const window = { webContents };

  function invoke(sender: unknown, url: unknown) {
    return mock.handlers.get('dude:external:open')!({ sender }, url) as Promise<{ ok: boolean; error?: string }>;
  }

  beforeEach(() => {
    mock.openExternal.mockReset();
    mock.openExternal.mockResolvedValue(undefined);
    registerExternalLinkHandlers(window as never);
  });

  it('opens a valid link through the OS and reports success', async () => {
    await expect(invoke(webContents, 'https://example.com')).resolves.toEqual({ ok: true });
    expect(mock.openExternal).toHaveBeenCalledWith('https://example.com/');
  });

  it('never opens anything for a request from another sender', async () => {
    await expect(invoke({}, 'https://example.com')).resolves.toMatchObject({ ok: false });
    expect(mock.openExternal).not.toHaveBeenCalled();
  });

  it('never opens a disallowed scheme, even from the trusted renderer', async () => {
    for (const url of ['file:///C:/x.exe', 'javascript:1', 'ms-settings:x', 'https://u:p@example.com', 42]) {
      await expect(invoke(webContents, url)).resolves.toMatchObject({ ok: false });
    }
    expect(mock.openExternal).not.toHaveBeenCalled();
  });

  it('reports a failure without throwing when the OS refuses', async () => {
    mock.openExternal.mockRejectedValue(new Error('no handler'));
    await expect(invoke(webContents, 'https://example.com')).resolves.toMatchObject({ ok: false });
  });
});
