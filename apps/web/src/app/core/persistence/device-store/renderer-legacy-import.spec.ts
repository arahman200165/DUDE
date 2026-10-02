import { fakeStore } from '../../platform/testing/fake-electron-bridge';
import { createDeviceKvBackend } from './device-kv-backend';
import { APPEARANCE_MIRROR_KEY, importRendererLegacyStorage } from './renderer-legacy-import';

describe('importRendererLegacyStorage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('copies dude keys once, skips invalid ones, and clears the source except the appearance mirror', async () => {
    localStorage.setItem('dude:v1:json:indent', '4');
    localStorage.setItem(APPEARANCE_MIRROR_KEY, '{"mode":"dark"}');
    localStorage.setItem(`dude:v1:ns:${'k'.repeat(200)}`, '1');
    localStorage.setItem('unrelated', 'keep');
    const store = fakeStore();
    const backend = createDeviceKvBackend({ kv: [] }, store);

    const first = await importRendererLegacyStorage(backend);
    expect(first).toEqual({ alreadyDone: false, imported: 2, skipped: 1 });
    expect(backend.get('dude:v1:json:indent')).toBe('4');
    expect(backend.get('dude:v1:__renderer-import__:done')).toBe('true');
    expect(localStorage.getItem('dude:v1:json:indent')).toBeNull();
    expect(localStorage.getItem(APPEARANCE_MIRROR_KEY)).toBe('{"mode":"dark"}');
    expect(localStorage.getItem('unrelated')).toBe('keep');
    const boot = await store.hydrate();
    expect(boot.kv.map((row) => `${row.namespace}:${row.key}`).sort()).toEqual(['__renderer-import__:done', 'json:indent', 'settings:appearance']);

    localStorage.setItem('dude:v1:json:later', '1');
    const second = await importRendererLegacyStorage(backend);
    expect(second.alreadyDone).toBe(true);
    expect(backend.get('dude:v1:json:later')).toBeNull();
    backend.dispose();
  });
});
