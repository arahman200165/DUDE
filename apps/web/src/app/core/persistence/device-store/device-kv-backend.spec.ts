import { vi } from 'vitest';
import type { KvMutation } from '@dude/contracts';
import { createDeviceKvBackend, parseStorageKey, toStorageKey, type DeviceKvBridge } from './device-kv-backend';

interface FakeBridge extends DeviceKvBridge {
  commits: KvMutation[][];
  noWait: KvMutation[][];
  fail: boolean;
  flushRequest: () => Promise<void> | void;
}

function fakeBridge(): FakeBridge {
  let flushCb: () => Promise<void> | void = () => {};
  const bridge: FakeBridge = {
    commits: [],
    noWait: [],
    fail: false,
    commitKv: async (mutations) => {
      if (bridge.fail) return { ok: false as const, error: 'down' };
      bridge.commits.push([...mutations]);
      return { ok: true as const, count: mutations.length };
    },
    commitKvNoWait: (mutations) => { bridge.noWait.push([...mutations]); },
    onFlushRequest: (cb) => { flushCb = cb; return () => {}; },
    flushRequest: () => flushCb(),
  };
  return bridge;
}

describe('parseStorageKey', () => {
  it('round-trips tool keys and maps consent keys to the __consent__ namespace', () => {
    expect(parseStorageKey('dude:v1:json:indent')).toEqual({ namespace: 'json', key: 'indent' });
    expect(parseStorageKey('dude:v1:__consent__:json:history')).toEqual({ namespace: '__consent__', key: 'json:history' });
    expect(toStorageKey('__consent__', 'json:history')).toBe('dude:v1:__consent__:json:history');
    expect(parseStorageKey('other:key')).toBeNull();
    expect(parseStorageKey('dude:v1:bad ns:key')).toBeNull();
    expect(parseStorageKey(`dude:v1:ns:${'k'.repeat(129)}`)).toBeNull();
  });
});

describe('createDeviceKvBackend', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hydrates raw strings and serves them synchronously', () => {
    const backend = createDeviceKvBackend({ kv: [{ namespace: 'json', key: 'indent', value: 4 }, { namespace: 'a', key: 'b', value: { x: 1 } }] }, fakeBridge());
    expect(backend.get('dude:v1:json:indent')).toBe('4');
    expect(backend.get('dude:v1:a:b')).toBe('{"x":1}');
    expect(backend.keys('dude:v1:json:')).toEqual(['dude:v1:json:indent']);
    backend.dispose();
  });

  it('debounces writes for 1 s into one batch with parsed values, policy and scope', async () => {
    const bridge = fakeBridge();
    const backend = createDeviceKvBackend({ kv: [] }, bridge);
    backend.set('dude:v1:json:indent', '2', { policy: 'local', scope: 'environment' });
    backend.set('dude:v1:json:indent', '4', { policy: 'local', scope: 'environment' });
    backend.set('dude:v1:json:mode', '"tabs"', { policy: 'user-choice' });
    expect(backend.get('dude:v1:json:indent')).toBe('4');
    await vi.advanceTimersByTimeAsync(999);
    expect(bridge.commits).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(bridge.commits).toEqual([[
      { namespace: 'json', key: 'indent', value: 4, policy: 'local', scope: 'environment' },
      { namespace: 'json', key: 'mode', value: 'tabs', policy: 'user-choice' },
    ]]);
    expect(backend.pendingCount()).toBe(0);
    backend.dispose();
  });

  it('sends removals and maps consent keys', async () => {
    const bridge = fakeBridge();
    const backend = createDeviceKvBackend({ kv: [{ namespace: 'json', key: 'x', value: 1 }] }, bridge);
    backend.remove('dude:v1:json:x');
    backend.set('dude:v1:__consent__:json:x', 'true');
    await backend.flush();
    expect(bridge.commits[0]).toEqual([
      { namespace: 'json', key: 'x', policy: 'local', remove: true },
      { namespace: '__consent__', key: 'json:x', value: true, policy: 'local' },
    ]);
    backend.dispose();
  });

  it('flushes immediate keys without waiting for the debounce', async () => {
    const bridge = fakeBridge();
    const backend = createDeviceKvBackend({ kv: [] }, bridge, { immediate: (ns, key) => ns === 'settings' && key === 'appearance' });
    backend.set('dude:v1:settings:appearance', '{"mode":"dark"}');
    await vi.advanceTimersByTimeAsync(0);
    expect(bridge.commits).toHaveLength(1);
    backend.dispose();
  });

  it('flush resolves after the commit settles, including the main flush request', async () => {
    const bridge = fakeBridge();
    const backend = createDeviceKvBackend({ kv: [] }, bridge);
    backend.set('dude:v1:a:b', '1');
    await bridge.flushRequest();
    expect(bridge.commits).toHaveLength(1);
    expect(backend.pendingCount()).toBe(0);
    backend.dispose();
  });

  it('keeps keys dirty after a failed commit and retries on the next flush, logging once', async () => {
    const bridge = fakeBridge();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backend = createDeviceKvBackend({ kv: [] }, bridge);
    bridge.fail = true;
    backend.set('dude:v1:a:b', '1');
    await backend.flush();
    await backend.flush();
    expect(backend.pendingCount()).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    bridge.fail = false;
    await backend.flush();
    expect(backend.pendingCount()).toBe(0);
    expect(bridge.commits).toHaveLength(1);
    warn.mockRestore();
    backend.dispose();
  });

  it('chunks batches to 1000 mutations', async () => {
    const bridge = fakeBridge();
    const backend = createDeviceKvBackend({ kv: [] }, bridge);
    for (let i = 0; i < 1500; i++) backend.set(`dude:v1:bulk:k${i}`, String(i));
    await backend.flush();
    expect(bridge.commits.map((c) => c.length)).toEqual([1000, 500]);
    backend.dispose();
  });

  it('sends whatever is dirty with commitKvNoWait on pagehide', () => {
    const bridge = fakeBridge();
    const backend = createDeviceKvBackend({ kv: [] }, bridge);
    backend.set('dude:v1:a:b', '7');
    window.dispatchEvent(new Event('pagehide'));
    expect(bridge.noWait).toEqual([[{ namespace: 'a', key: 'b', value: 7, policy: 'local' }]]);
    backend.dispose();
  });
});
