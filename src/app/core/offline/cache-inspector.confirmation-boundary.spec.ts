import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { ConnectivityService } from '../connectivity/connectivity.service';
import { PlatformService } from '../platform/platform.service';
import { CacheInspectorService, PAGE_RELOAD } from './cache-inspector.service';
import { OfflineReadinessService } from './offline-readiness.service';
import { OfflineMap } from './offline-map.model';
import { FakeCacheStorage } from './testing/fake-cache-storage';

// Confirmation-boundary spec for the Web & Offline cache actions (DUDE_PRD.md §21 Phase 26 Item 5,
// held to the §5.2.1 contract). Planning, inspecting, and refreshing must never delete anything,
// and the destructive paths must touch only the service worker's `ngsw:*` caches, never the
// localStorage/IndexedDB that holds user data.

const base = () => new URL('.', document.baseURI).href;
const HASH = 'abc123';
const cacheName = (group: string) => `ngsw:/:${HASH}:assets:${group}:cache`;

const MAP: OfflineMap = {
  schemaVersion: 2,
  files: ['chunk-json.js', 'chunk-shared.js', 'chunk-py.js', 'assets/vendor/pyodide/pyodide.asm.wasm', 'assets/vendor/pyodide/pyodide.js'],
  sizes: [100, 50, 200, 9000, 20],
  tools: { json: { open: [0], extra: [1] }, 'python-playground': { open: [2], extra: [1] } },
  shell: [],
  groups: {
    'tool-chunks': { installMode: 'lazy', files: [0, 1, 2] },
    pyodide: { installMode: 'lazy', files: [3, 4] },
  },
};

describe('Web & Offline cache actions: confirmation boundary', () => {
  let storage: FakeCacheStorage;
  let online: ReturnType<typeof signal<boolean>>;
  let reload: ReturnType<typeof vi.fn>;
  let unregister: ReturnType<typeof vi.fn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = new FakeCacheStorage()
      .seed(cacheName('tool-chunks'), [`${base()}chunk-json.js`, `${base()}chunk-shared.js`])
      .seed(cacheName('pyodide'), [`${base()}assets/vendor/pyodide/pyodide.asm.wasm`, `${base()}assets/vendor/pyodide/pyodide.js`])
      .seed('ngsw:/:db:control', []);
    vi.stubGlobal('caches', storage);
    unregister = vi.fn().mockResolvedValue(true);
    // jsdom's navigator has neither API; define them on the instance, removed in afterEach.
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: {}, getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { estimate: vi.fn().mockResolvedValue({ usage: 1, quota: 2 }), persisted: vi.fn().mockResolvedValue(false) },
    });
    fetchSpy = vi.fn(async (url: URL | string) => {
      const href = String(url);
      if (href.endsWith('offline-map.json')) return new Response(JSON.stringify(MAP));
      // Simulates ngsw's lazy group: a controlled fetch of a hashed file lands in its cache.
      const group = href.includes('/pyodide/') ? 'pyodide' : 'tool-chunks';
      (await storage.open(cacheName(group))).urls.add(href);
      return new Response('x');
    });
    vi.stubGlobal('fetch', fetchSpy);
    localStorage.setItem('dude:v1:json:input', '"keep me"');
    online = signal(true);
    reload = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: { isEnabled: true } },
        { provide: PlatformService, useValue: { isDesktop: () => false } },
        { provide: ConnectivityService, useValue: { online } },
        { provide: PAGE_RELOAD, useValue: reload },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    delete (navigator as { storage?: unknown }).storage;
    localStorage.clear();
  });

  it('refreshing, inspecting, and planning never delete anything', async () => {
    const inspector = TestBed.inject(CacheInspectorService);
    await inspector.refresh();
    inspector.groups();
    inspector.planClearRuntime('pyodide');
    await inspector.planRepair();

    expect(storage.deleted).toEqual([]);
    expect(storage.stores.get(cacheName('pyodide'))!.urls.size).toBe(2);
    expect(unregister).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('counts a tool as ready once what opening it fetches is cached, even before its extras', async () => {
    storage.stores.get(cacheName('tool-chunks'))!.urls.delete(`${base()}chunk-shared.js`);
    const readiness = TestBed.inject(OfflineReadinessService);
    await readiness.refresh();

    expect(readiness.readinessOf('json')).toBe('ready');
    expect(readiness.planTool('json')!.missingFiles).toEqual(['chunk-shared.js']);
  });

  it('reports readiness from the map and what the service worker actually cached', async () => {
    const readiness = TestBed.inject(OfflineReadinessService);
    await readiness.refresh();

    expect(readiness.readinessOf('json')).toBe('ready');
    // python-playground declares the pyodide runtime; its own chunk isn't cached yet.
    expect(readiness.readinessOf('python-playground')).toBe('missing');
    expect(readiness.readinessOf('not-in-map')).toBe('unknown');
    expect(readiness.planTool('python-playground')!.missingFiles).toEqual(['chunk-py.js']);
  });

  it('dims a tool only while offline, and only when it is known to be uncached', async () => {
    const readiness = TestBed.inject(OfflineReadinessService);
    await readiness.refresh();

    expect(readiness.unavailableOffline('python-playground')).toBe(false);
    online.set(false);
    expect(readiness.unavailableOffline('python-playground')).toBe(true);
    expect(readiness.unavailableOffline('json')).toBe(false);
  });

  it('"Make available offline" fetches only the missing files, then re-scans', async () => {
    const readiness = TestBed.inject(OfflineReadinessService);
    await readiness.refresh();
    fetchSpy.mockClear();

    const failed = await readiness.cache(readiness.planTool('python-playground')!);

    expect(failed).toBe(0);
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([`${base()}chunk-py.js`]);
    expect(readiness.readinessOf('python-playground')).toBe('ready');
  });

  it("confirmed clear removes only that runtime's cached files and keeps user data", async () => {
    const inspector = TestBed.inject(CacheInspectorService);
    await inspector.refresh();
    const plan = inspector.planClearRuntime('pyodide');
    expect(plan).toMatchObject({ kind: 'clear-runtime', bytes: 9020 });

    await inspector.execute(plan);

    expect(storage.stores.get(cacheName('pyodide'))!.urls.size).toBe(0);
    expect(storage.stores.get(cacheName('tool-chunks'))!.urls.size).toBe(2);
    expect(localStorage.getItem('dude:v1:json:input')).toBe('"keep me"');
    expect(reload).not.toHaveBeenCalled();
  });

  it('confirmed repair unregisters the worker, deletes only ngsw caches, keeps user data, and reloads', async () => {
    storage.seed('some-other-app-cache', ['https://example.com/x']);
    const inspector = TestBed.inject(CacheInspectorService);
    const plan = await inspector.planRepair();
    expect(plan.kind === 'repair' && plan.cacheNames).not.toContain('some-other-app-cache');

    await inspector.execute(plan);

    expect(unregister).toHaveBeenCalledTimes(1);
    expect([...storage.stores.keys()]).toEqual(['some-other-app-cache']);
    expect(localStorage.getItem('dude:v1:json:input')).toBe('"keep me"');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is inert on desktop: no map fetch, everything reports unknown', async () => {
    TestBed.overrideProvider(PlatformService, { useValue: { isDesktop: () => true } });
    const readiness = TestBed.inject(OfflineReadinessService);
    await readiness.refresh();

    expect(readiness.enabled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readiness.readinessOf('json')).toBe('unknown');
  });
});
