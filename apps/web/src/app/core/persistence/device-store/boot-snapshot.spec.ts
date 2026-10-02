import { vi } from 'vitest';
import { fakeElectronBridge } from '../../platform/testing/fake-electron-bridge';
import { loadBootSnapshot } from './boot-snapshot';

describe('loadBootSnapshot', () => {
  afterEach(() => vi.useRealTimers());

  it('returns null boot on web', async () => {
    expect(await loadBootSnapshot(undefined)).toEqual({ boot: null });
  });

  it('returns the hydrated boot when ready', async () => {
    const result = await loadBootSnapshot(fakeElectronBridge());
    expect(result.boot?.status).toBe('ready');
    expect(result.degradedReason).toBeUndefined();
  });

  it('degrades when hydrate times out', async () => {
    vi.useFakeTimers();
    const bridge = fakeElectronBridge();
    bridge.store.hydrate = () => new Promise(() => {});
    const pending = loadBootSnapshot(bridge, 3000);
    await vi.advanceTimersByTimeAsync(3001);
    expect(await pending).toEqual({ boot: null, degradedReason: 'hydrate-timeout' });
  });

  it('degrades when hydrate rejects or reports a non-ready store', async () => {
    const rejecting = fakeElectronBridge();
    rejecting.store.hydrate = async () => { throw new Error('boom'); };
    expect((await loadBootSnapshot(rejecting)).degradedReason).toContain('boom');

    const corrupt = fakeElectronBridge();
    corrupt.store.hydrate = async () => ({ status: 'corrupt', device: null, kv: [], records: [] });
    expect((await loadBootSnapshot(corrupt)).degradedReason).toBe('store-corrupt');
  });
});
