import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  handles: new Map<string, (...args: any[]) => any>(),
  run: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { isPackaged: false, quit: vi.fn() },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => mock.handles.set(channel, handler) },
}));
vi.mock('./network-runner', () => ({ helperPath: () => 'unused', runNetworkRequest: mock.run }));
import { registerNetworkHandlers } from './network-bridge';

const owner = { id: 7, isDestroyed: () => false, once: vi.fn(), send: vi.fn() };
const ipc = { sender: owner };
beforeEach(() => {
  mock.handles.clear();
  mock.run.mockReset();
  owner.send.mockClear();
  registerNetworkHandlers();
});

describe('network IPC confirmation boundary', () => {
  it('blocks a direct scan and renderer-side limit bypass', () => {
    const start = mock.handles.get('dude:network:start')!;
    expect(start(ipc, { kind: 'port-scanner', target: '127.0.0.1', ports: [80] }).error).toMatch(/Review and confirm/);
    expect(start(ipc, { kind: 'port-scanner', target: '192.0.2.0/27', ports: [80] }).error).toMatch(/at most 16/);
    expect(mock.run).not.toHaveBeenCalled();
  });

  it('binds a reviewed request and exact expanded preview to its owner', async () => {
    mock.run.mockResolvedValue({ ok: true });
    const prepare = mock.handles.get('dude:network:prepare')!;
    const start = mock.handles.get('dude:network:start')!;
    const request = { kind: 'port-scanner', target: '192.0.2.5/30', ports: [80, 443], protocol: 'tcp' };
    const staged = prepare(ipc, request);
    expect(staged.preview.targets).toEqual(['192.0.2.4', '192.0.2.5', '192.0.2.6', '192.0.2.7']);
    expect(staged.preview.probeCount).toBe(8);
    expect(start(ipc, { ...request, ports: [80, 22] }, staged.token).error).toMatch(/changed/);
    expect(start(ipc, request, staged.token).error).toMatch(/changed/);
    const stagedAgain = prepare(ipc, request);
    expect(start({ sender: { ...owner, id: 8 } }, request, stagedAgain.token).error).toMatch(/changed/);
    expect(start(ipc, request, stagedAgain.token).error).toMatch(/changed/);
    const final = prepare(ipc, request);
    expect(start(ipc, request, final.token).ok).toBe(true);
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledWith('dude:network:event', expect.objectContaining({ type: 'done' })));
  });

  it('requires review for HTTP methods that may write remote state', () => {
    const start = mock.handles.get('dude:network:start')!;
    expect(start(ipc, { kind: 'connectivity-tester', connectivityMode: 'http', target: 'https://example.com', method: 'POST' }).error).toMatch(/Review and confirm/);
  });

  it('requires review for Phase 28 multi-connection and elevated checks, but not one-shot inspection', () => {
    const start = mock.handles.get('dude:network:start')!;
    mock.run.mockResolvedValue({ ok: true });
    for (const request of [
      { kind: 'tls-enumeration', target: 'example.com', port: 443 },
      { kind: 'https-analyzer', target: 'example.com' },
      { kind: 'tls-capture', target: 'example.com', port: 443 },
      { kind: 'email-auth', target: 'example.com', dkimCommonProbe: true },
    ]) expect(start(ipc, request).error, request.kind).toMatch(/Review and confirm/);
    expect(start(ipc, { kind: 'tls-inspector', target: 'example.com', port: 443 }).ok).toBe(true);
    expect(start(ipc, { kind: 'email-auth', target: 'example.com' }).ok).toBe(true);
  });

  it('rejects a malformed Phase 28 request before it reaches the runner', () => {
    const start = mock.handles.get('dude:network:start')!;
    expect(start(ipc, { kind: 'dns-lookup', target: 'example.com', resolver: 'not a server', resolverTransport: 'classic' }).error).toMatch(/IP addresses/);
    expect(start(ipc, { kind: 'tls-inspector', target: 'example.com', alpn: Array(9).fill('h2') }).error).toMatch(/ALPN/);
    expect(start(ipc, { kind: 'revocation', target: 'example.com', urls: ['file:///etc/passwd'] }).error).toMatch(/HTTP or HTTPS/);
    expect(mock.run).not.toHaveBeenCalled();
  });

  it('cancels only an owned job and sends ordered progress, error, and done events', async () => {
    mock.run.mockImplementation((_request, signal, progress) => {
      progress(1, 4, { status: 'success' });
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Cancelled.')), { once: true }));
    });
    const start = mock.handles.get('dude:network:start')!;
    const cancel = mock.handles.get('dude:network:cancel')!;
    const result = start(ipc, { kind: 'ping', target: '127.0.0.1' });
    expect(result.ok).toBe(true);
    expect(cancel({ sender: { id: 8 } }, result.jobId)).toBe(false);
    expect(cancel(ipc, result.jobId)).toBe(true);
    await vi.waitFor(() => expect(owner.send).toHaveBeenCalledTimes(3));
    const events = owner.send.mock.calls.map((call) => call[1]);
    expect(events.map((event) => event.type)).toEqual(['progress', 'error', 'done']);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3]);
  });
});
