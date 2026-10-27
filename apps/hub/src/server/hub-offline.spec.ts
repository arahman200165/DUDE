import { createHash } from 'node:crypto';
import { cpSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterAll, describe, expect, it } from 'vitest';
import { makeWebRoot, request, startTestHub } from './test-helpers.js';
import type { TestHub } from './test-helpers.js';

/**
 * The Hub-offline page and its navigation fallback (32-SS1, Milestone 844, PD-123, PD-144): a public, dependency-free page the stock
 * Angular worker pre-caches, and a thin worker wrapper (`hub-worker.js`) that answers a page navigation with it only while the Hub is
 * unreachable. The files live in `apps/hub/web-static` and are copied into the Hub web build by `scripts/add-hub-static.mjs`.
 */
const REPO = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const STATIC_DIR = path.join(REPO, 'apps', 'hub', 'web-static');
const read = (...parts: string[]): string => readFileSync(path.join(REPO, ...parts), 'utf8');
/** The logic file is a classic script (the Hub package is ESM, so it cannot be `require`d): evaluate it in a vm context with a fake worker `self`. */
function loadLogic(): any {
  const self: any = { setTimeout, clearTimeout, AbortController };
  vm.runInContext(readFileSync(path.join(STATIC_DIR, 'hub-offline-logic.js'), 'utf8'), vm.createContext({ self, URL }));
  return self.DudeHubOffline;
}
const logic = loadLogic();

const ORIGIN = 'https://hub.test';
const navigation = (url = `${ORIGIN}/tools/base64`, over: Record<string, unknown> = {}) => ({ mode: 'navigate', method: 'GET', destination: 'document', url, ...over });

describe('hub-offline-logic: isFallbackNavigation', () => {
  it('matches a same-origin page navigation to an extension-less path, like the ngsw navigationUrls of the Hub build', () => {
    for (const url of [`${ORIGIN}/`, `${ORIGIN}/tools/base64`, `${ORIGIN}/hub/sign-in?returnUrl=%2Fx`, `${ORIGIN}/settings/sync`]) expect(logic.isFallbackNavigation(navigation(url), ORIGIN), url).toBe(true);
  });
  it('leaves everything else to the stock worker: assets, the API, the sandbox pages, other origins, non-navigations', () => {
    for (const url of [`${ORIGIN}/main-ABC12345.js`, `${ORIGIN}/offline.html`, `${ORIGIN}/api/v1/auth/oidc/callback?code=x`, `${ORIGIN}/api`, `${ORIGIN}/sandbox/code.html`, `${ORIGIN}/a__b`, 'https://other.test/x']) expect(logic.isFallbackNavigation(navigation(url), ORIGIN), url).toBe(false);
    for (const over of [{ mode: 'cors' }, { mode: 'no-cors' }, { method: 'POST' }, { destination: 'iframe' }, { destination: 'script' }]) expect(logic.isFallbackNavigation(navigation(undefined, over), ORIGIN), JSON.stringify(over)).toBe(false);
    expect(logic.isFallbackNavigation(undefined, ORIGIN)).toBe(false);
    expect(logic.isFallbackNavigation({ ...navigation(), url: 'not a url' }, ORIGIN)).toBe(false);
  });
});

describe('hub-offline-logic: probeHub and statusMeansDown', () => {
  it('counts a network failure, a timeout and any 5xx (an ingress 502, 503, 504 or 530) as down, and any other answer as up', async () => {
    for (const status of [500, 502, 503, 504, 530]) expect(logic.statusMeansDown(status), String(status)).toBe(true);
    for (const status of [200, 204, 304, 401, 403, 404, 429]) expect(logic.statusMeansDown(status), String(status)).toBe(false);
    expect(logic.statusMeansDown(undefined)).toBe(true);

    const calls: Array<[string, any]> = [];
    const ok = (status: number) => (url: string, init: any) => { calls.push([url, init]); return Promise.resolve({ status }); };
    expect(await logic.probeHub(ORIGIN, { fetch: ok(200) })).toBe('up');
    expect(await logic.probeHub(ORIGIN, { fetch: ok(401) })).toBe('up');
    expect(await logic.probeHub(ORIGIN, { fetch: ok(530) })).toBe('down');
    expect(await logic.probeHub(ORIGIN, { fetch: () => Promise.reject(new TypeError('Failed to fetch')) })).toBe('down');
    expect(await logic.probeHub(ORIGIN, { fetch: () => { throw new Error('sync'); } })).toBe('down');
    // The probe asks the public hello endpoint, uncached, with no credentials.
    expect(calls[0]![0]).toBe(`${ORIGIN}/api/v1/hello`);
    expect(calls[0]![1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
    // A hung request is down once the timeout fires (the timer is injected: no real wait).
    let abort = 0;
    class Controller { signal = {}; abort() { abort += 1; } }
    expect(await logic.probeHub(ORIGIN, { fetch: () => new Promise(() => undefined), setTimeout: (fn: () => void) => { queueMicrotask(fn); return 1; }, clearTimeout: () => undefined, AbortController: Controller })).toBe('down');
    expect(abort).toBe(1);
  });
});

describe('hub-offline-logic: chooseNavigationResponse', () => {
  const page = { name: 'offline page' };
  const shell = { name: 'app shell' };
  it('answers with the stock response while the Hub is up, and never looks for the offline page', async () => {
    let looked = false;
    expect(await logic.chooseNavigationResponse(Promise.resolve(shell), async () => 'up', async () => { looked = true; return page; })).toBe(shell);
    expect(looked).toBe(false);
  });
  it('answers with the cached offline page while the Hub is down', async () => {
    expect(await logic.chooseNavigationResponse(Promise.resolve(shell), async () => 'down', async () => page)).toBe(page);
  });
  it('falls back to the stock response when the page is not cached or the lookup or the probe fails', async () => {
    expect(await logic.chooseNavigationResponse(Promise.resolve(shell), async () => 'down', async () => undefined)).toBe(shell);
    expect(await logic.chooseNavigationResponse(Promise.resolve(shell), async () => 'down', () => Promise.reject(new Error('cache')))).toBe(shell);
    expect(await logic.chooseNavigationResponse(Promise.resolve(shell), () => Promise.reject(new Error('probe')), async () => page)).toBe(shell);
  });
  it('a failing stock response still surfaces when it is the answer, and is never an unhandled rejection otherwise', async () => {
    await expect(logic.chooseNavigationResponse(Promise.reject(new Error('stock')), async () => 'up', async () => page)).rejects.toThrow('stock');
    expect(await logic.chooseNavigationResponse(Promise.reject(new Error('stock')), async () => 'down', async () => page)).toBe(page);
  });
  it('reads the offline page from the worker caches by absolute URL, read only', async () => {
    const seen: unknown[] = [];
    const stored = { name: 'cached' };
    const caches = { match: (url: string, options: unknown) => { seen.push(url, options); return Promise.resolve(stored); }, open: () => { throw new Error('must not write'); } };
    expect(await logic.findOfflinePage(caches, ORIGIN)).toBe(stored);
    expect(seen).toEqual([`${ORIGIN}/offline.html`, { ignoreVary: true }]);
  });
});

/** Runs hub-worker.js in a vm with a fake worker scope whose "ngsw-worker.js" registers one fetch listener. */
function loadWorker(options: { stock: (event: any) => void; fetchStatus?: number | 'throws'; cached?: unknown }) {
  const registered = new Map<string, Array<(event: any) => void>>();
  const imported: string[] = [];
  const stockEvents: any[] = [];
  const self: any = {
    location: { origin: ORIGIN },
    addEventListener(type: string, listener: (event: any) => void) { registered.set(type, [...(registered.get(type) ?? []), listener]); },
    caches: { match: () => Promise.resolve(options.cached) },
    fetch: () => (options.fetchStatus === 'throws' ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve({ status: options.fetchStatus ?? 200 })),
    setTimeout, clearTimeout, AbortController,
  };
  const context = vm.createContext({ self, URL, importScripts: (name: string) => {
    imported.push(name);
    if (name.endsWith('hub-offline-logic.js')) vm.runInContext(readFileSync(path.join(STATIC_DIR, 'hub-offline-logic.js'), 'utf8'), context);
    else if (name.endsWith('ngsw-worker.js')) {
      self.addEventListener('install', () => undefined);
      self.addEventListener('fetch', (event: any) => { stockEvents.push(event); options.stock(event); });
    } else throw new Error(`unexpected import ${name}`);
  } });
  vm.runInContext(readFileSync(path.join(STATIC_DIR, 'hub-worker.js'), 'utf8'), context);
  const fetchEvent = (request: unknown) => {
    const answers: unknown[] = [];
    const event: any = { request, respondWith: (a: unknown) => { answers.push(a); }, waitUntil: () => undefined };
    for (const listener of registered.get('fetch') ?? []) listener(event);
    return { event, answers };
  };
  return { registered, imported, stockEvents, fetchEvent, self };
}

const stockShell = (event: any): void => { event.respondWith(Promise.resolve('SHELL')); };

describe('hub-worker.js (the stock worker plus the fallback)', () => {
  it('imports the logic, then the stock worker, keeps the stock install listener, installs exactly one fetch listener and restores addEventListener', () => {
    const w = loadWorker({ stock: stockShell });
    expect(w.imported).toEqual(['./hub-offline-logic.js', './ngsw-worker.js']);
    expect(w.registered.get('install')).toHaveLength(1);
    expect(w.registered.get('fetch')).toHaveLength(1);
    w.self.addEventListener('message', () => undefined);
    expect(w.registered.get('message')).toHaveLength(1);
  });

  it('passes every non-navigation request (asset, API, cross-site) to the stock listener with the real event, untouched', async () => {
    const w = loadWorker({ stock: (e) => e.respondWith('ASSET'), fetchStatus: 'throws', cached: 'OFFLINE' });
    for (const url of [`${ORIGIN}/main-ABC12345.js`, `${ORIGIN}/api/v1/hello`, `${ORIGIN}/api/v1/auth/oidc/callback?code=x`]) {
      const { event, answers } = w.fetchEvent({ mode: url.includes('callback') ? 'navigate' : 'no-cors', method: 'GET', destination: url.includes('callback') ? 'document' : 'script', url });
      expect(answers, url).toEqual(['ASSET']);
      expect(w.stockEvents.at(-1)).toBe(event);
    }
  });

  it('serves the app shell for a navigation while the Hub is up', async () => {
    const w = loadWorker({ stock: stockShell, fetchStatus: 200, cached: 'OFFLINE' });
    const { answers } = w.fetchEvent(navigation());
    expect(answers).toHaveLength(1);
    expect(await answers[0]).toBe('SHELL');
  });

  it('serves the cached offline page for a navigation while the Hub is unreachable or answers 5xx', async () => {
    for (const fetchStatus of ['throws', 502, 530] as const) {
      const w = loadWorker({ stock: stockShell, fetchStatus, cached: 'OFFLINE' });
      const { answers } = w.fetchEvent(navigation());
      expect(await answers[0], String(fetchStatus)).toBe('OFFLINE');
    }
  });

  it('keeps the app shell when the Hub is down but the offline page is not cached', async () => {
    const w = loadWorker({ stock: stockShell, fetchStatus: 'throws', cached: undefined });
    expect(await w.fetchEvent(navigation()).answers[0]).toBe('SHELL');
  });

  it('does nothing for a navigation the stock worker declines (the browser then handles it as usual)', () => {
    const w = loadWorker({ stock: () => undefined, fetchStatus: 'throws', cached: 'OFFLINE' });
    expect(w.fetchEvent(navigation()).answers).toEqual([]);
  });

  it('hands the stock listener an event whose other members still work (request, waitUntil)', () => {
    let seen: any;
    const w = loadWorker({ stock: (event) => { seen = { url: event.request.url, waited: typeof event.waitUntil }; event.waitUntil(Promise.resolve()); event.respondWith('x'); }, fetchStatus: 200 });
    w.fetchEvent(navigation());
    expect(seen).toEqual({ url: `${ORIGIN}/tools/base64`, waited: 'function' });
  });
});

describe('the offline page itself', () => {
  const html = readFileSync(path.join(STATIC_DIR, 'offline.html'), 'utf8');
  it('says the Hub is offline, shows the address, has a Retry button, and explains that desktop and Android keep working and captures wait', () => {
    expect(html).toContain('Your DUDE Hub is offline');
    expect(html).toContain('location.host');
    expect(html).toMatch(/<button[^>]*id="retry"[^>]*>Retry<\/button>/);
    expect(html).toMatch(/desktop/i);
    expect(html).toMatch(/Android/);
    expect(html).toMatch(/queued/);
    expect(html).toContain('Nothing from your DUDE data is stored on this page.');
  });
  it('is dependency-free and holds no app data: no external file, no remote URL, no storage or credentials, system colors with prefers-color-scheme', () => {
    expect(html).not.toMatch(/<(link|img|iframe|object|embed)\b/i);
    expect(html).not.toMatch(/<script[^>]*\bsrc=/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.serviceWorker|caches\./);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).toContain('color-scheme: light dark');
    expect(html).toContain('prefers-color-scheme');
    expect(html).toMatch(/Canvas/);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
  it('contains no app secret or data (nothing named like a token, session, owner or csrf value)', () => {
    expect(html).not.toMatch(/dob_|ddt_|dit_|csrf|__Host-|password|owner/i);
  });
});

describe('the Hub serves the offline files publicly with the right cache and security headers', () => {
  const hubs: TestHub[] = [];
  afterAll(async () => { await Promise.all(hubs.map((h) => h.close())); });

  it('serves offline.html and the worker files without any session; the worker files always revalidate; the page CSP hashes its one inline script and never allows unsafe-inline scripts', async () => {
    const root = makeWebRoot();
    cpSync(STATIC_DIR, root, { recursive: true });
    const hub = await startTestHub({ webRoot: root });
    hubs.push(hub);
    const get = (p: string, method = 'GET') => request(hub.port, hub.tls.certPem, p, { method });

    const page = await get('/offline.html');
    expect(page.status).toBe(200);
    expect(String(page.headers['content-type'])).toContain('text/html');
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(page.headers['set-cookie']).toBeUndefined();
    expect(page.body).toBe(readFileSync(path.join(STATIC_DIR, 'offline.html'), 'utf8'));
    const csp = String(page.headers['content-security-policy']);
    const script = /<script>([\s\S]*?)<\/script>/.exec(page.body)![1]!;
    expect(csp).toContain(`'sha256-${createHash('sha256').update(script.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect((await get('/offline.html', 'HEAD')).status).toBe(200);

    for (const name of ['/hub-worker.js', '/hub-offline-logic.js']) {
      const res = await get(name);
      expect(res.status, name).toBe(200);
      expect(String(res.headers['content-type']), name).toContain('text/javascript');
      // `hub-offline-logic.js` is not a content-hashed name and must never be served immutable (a stale copy would pin a stale worker).
      expect(res.headers['cache-control'], name).toBe('no-cache');
      expect(res.headers['set-cookie'], name).toBeUndefined();
    }
  });

  it('keeps the whole folder to the three public files', () => {
    expect(readdirSync(STATIC_DIR).sort()).toEqual(['hub-offline-logic.js', 'hub-worker.js', 'offline.html']);
  });
});

describe('the build wiring', () => {
  it('ngsw-config.hub.json pre-caches /offline.html in the prefetched app group and serves it as an asset, not a navigation', () => {
    const config = JSON.parse(read('ngsw-config.hub.json')) as { assetGroups: Array<{ name: string; installMode: string; resources: { files: string[] } }>; navigationUrls: string[] };
    const group = config.assetGroups.find((g) => g.resources.files.includes('/offline.html'));
    expect(group?.name).toBe('app');
    expect(group?.installMode).toBe('prefetch');
    expect(config.navigationUrls).toContain('!/**/*.*');
    // The worker files are fetched by the browser itself, so no asset group lists them.
    expect(JSON.stringify(config.assetGroups)).not.toMatch(/hub-worker|hub-offline-logic/);
  });
  it('GitHub Pages stays unchanged: its ngsw config and public folder know nothing of the offline files, and only the Hub build registers the Hub worker', () => {
    expect(read('ngsw-config.json')).not.toMatch(/offline\.html|hub-worker/);
    expect(readdirSync(path.join(REPO, 'apps', 'web', 'public'))).not.toEqual(expect.arrayContaining(['offline.html']));
    const config = read('apps', 'web', 'src', 'app', 'app.config.ts');
    expect(config).toContain("BUILD_HOST === 'hub' ? 'hub-worker.js' : 'ngsw-worker.js'");
  });
  it('the Hub build copies the files before ngsw.json is regenerated and verifies them afterwards', () => {
    const script = JSON.parse(read('package.json')).scripts['postbuild:hub-web'] as string;
    const steps = script.split(' && ');
    expect(steps[0]).toContain('add-hub-static.mjs dist/hub-web/browser');
    expect(steps[1]).toContain('generate-offline-map.mjs');
    expect(steps[2]).toContain('add-hub-static.mjs dist/hub-web/browser --verify');
    expect(read('scripts', 'check-cache-budget.mjs')).toMatch(/hub-worker\.js.*hub-offline-logic\.js/s);
  });
});
