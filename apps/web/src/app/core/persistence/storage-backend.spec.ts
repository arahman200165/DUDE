import { createStorageBackend } from './storage-backend';

describe('createStorageBackend', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips get/set/remove against localStorage', () => {
    const backend = createStorageBackend('local');

    expect(backend.set('k', 'v')).toBe(true);
    expect(backend.get('k')).toBe('v');
    expect(localStorage.getItem('k')).toBe('v');

    backend.remove('k');
    expect(backend.get('k')).toBeNull();
  });

  it('round-trips get/set/remove against sessionStorage', () => {
    const backend = createStorageBackend('session');

    expect(backend.set('k', 'v')).toBe(true);
    expect(backend.get('k')).toBe('v');
    expect(sessionStorage.getItem('k')).toBe('v');
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('returns false from set() and does not throw when the backend throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    const backend = createStorageBackend('local');
    expect(() => backend.set('k', 'v')).not.toThrow();
    expect(backend.set('k', 'v')).toBe(false);
  });

  it('returns null from get() and does not throw when the backend throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('disabled', 'SecurityError');
    });

    const backend = createStorageBackend('local');
    expect(() => backend.get('k')).not.toThrow();
    expect(backend.get('k')).toBeNull();
  });

  it('keys(prefix) only returns keys matching the prefix', () => {
    const backend = createStorageBackend('local');
    localStorage.setItem('dude:v1:a:x', '1');
    localStorage.setItem('dude:v1:b:x', '2');
    localStorage.setItem('unrelated', '3');

    expect(backend.keys('dude:v1:a:').sort()).toEqual(['dude:v1:a:x']);
  });
});
