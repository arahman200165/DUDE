import { activeLocalBackend, hasInstalledLocalBackend, installLocalBackend, resetLocalBackend } from './local-backend-registry';
import { createStorageBackend } from './storage-backend';
import { createDegradedMemoryBackend } from './device-store/device-kv-backend';

describe('local backend registry', () => {
  afterEach(() => {
    resetLocalBackend();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('defaults to window.localStorage', () => {
    expect(hasInstalledLocalBackend()).toBe(false);
    createStorageBackend('local').set('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('a backend created before install routes to the installed backend on every call', () => {
    const early = createStorageBackend('local');
    const memory = createDegradedMemoryBackend();
    installLocalBackend(memory);
    expect(activeLocalBackend()).toBe(memory);
    early.set('k', 'v');
    expect(memory.get('k')).toBe('v');
    expect(localStorage.getItem('k')).toBeNull();
    expect(early.keys('k')).toEqual(['k']);
    early.remove('k');
    expect(memory.get('k')).toBeNull();
  });

  it('keeps session on sessionStorage', () => {
    installLocalBackend(createDegradedMemoryBackend());
    createStorageBackend('session').set('s', '1');
    expect(sessionStorage.getItem('s')).toBe('1');
  });
});
