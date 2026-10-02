import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { createAppProtocolHandler, resolveWithinRoot } from './app-protocol';

// resolveWithinRoot is the one guard standing between a renderer-supplied path and the real
// filesystem for both the app protocol handler and fs-bridge.ts's native file-access IPC
// (DUDE_PRD.md §21 Phase 23 Item 9 -- "Electron contextIsolation/preload boundary" regression).

const ROOT = process.platform === 'win32' ? 'C:\\Users\\demo\\project' : '/home/demo/project';

describe('resolveWithinRoot', () => {
  it('resolves a normal relative path within root', () => {
    const resolved = resolveWithinRoot(ROOT, '/src/index.ts');
    expect(resolved).toBe(`${ROOT}${sep}src${sep}index.ts`);
  });

  it('resolves the root itself', () => {
    // path.join(root, '/') normalizes to a trailing separator, not the bare root string --
    // still correctly "within root", just not byte-identical to it.
    expect(resolveWithinRoot(ROOT, '/')).toBe(`${ROOT}${sep}`);
  });

  it('rejects a "../" traversal attempt that escapes root', () => {
    expect(resolveWithinRoot(ROOT, '/../../../etc/passwd')).toBeNull();
  });

  it('rejects a traversal attempt that escapes root via a sibling-looking prefix', () => {
    // Without the trailing-separator check, a naive startsWith(root) would wrongly accept this
    // as "inside" ROOT, since ROOT is a string prefix of the sibling directory's name.
    expect(resolveWithinRoot(ROOT, `/../${ROOT.split(sep).pop()}-evil-sibling/secret.txt`)).toBeNull();
  });

  it('rejects a percent-encoded traversal attempt', () => {
    expect(resolveWithinRoot(ROOT, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });

  it('rejects an absolute path that happens to resolve outside root', () => {
    const outside = process.platform === 'win32' ? '/../../Windows/System32/config/SAM' : '/../../../../root/.ssh/id_rsa';
    expect(resolveWithinRoot(ROOT, outside)).toBeNull();
  });
});

describe('createAppProtocolHandler', () => {
  let root: string;
  let handle: (request: Request) => Promise<Response>;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'dude-app-protocol-'));
    writeFileSync(join(root, 'index.html'), '<html>root</html>');
    writeFileSync(join(root, 'main.js'), 'console.log(1)');
    writeFileSync(join(root, 'pyodide.wasm'), Buffer.from([0, 97, 115, 109]));
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'index.html'), '<html>sub</html>');
    handle = createAppProtocolHandler(root);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const get = (url: string, method = 'GET') => handle(new Request(url, { method }));

  it('serves files with the right content type and security headers', async () => {
    const js = await get('dude-app://app/main.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
    expect(js.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(js.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await js.text()).toBe('console.log(1)');

    const wasm = await get('dude-app://app/pyodide.wasm');
    expect(wasm.headers.get('Content-Type')).toBe('application/wasm');
  });

  it('falls back to the root index.html for extensionless routes', async () => {
    expect(await (await get('dude-app://app/')).text()).toBe('<html>root</html>');
    expect(await (await get('dude-app://app/tools/base64')).text()).toBe('<html>root</html>');
  });

  it('serves a file inside a subfolder', async () => {
    expect(await (await get('dude-app://app/sub/index.html')).text()).toBe('<html>sub</html>');
  });

  it('never serves anything outside the root on traversal attempts', async () => {
    for (const url of ['dude-app://app/..%2f..%2fetc/passwd', 'dude-app://app/%2e%2e/%2e%2e/secret.txt', 'dude-app://app/..%2f..%2f..%2fWindows%2fwin.ini']) {
      const response = await get(url);
      expect([403, 404]).toContain(response.status);
    }
  });

  it('rejects a different host', async () => {
    expect((await get('dude-app://evil/main.js')).status).toBe(404);
    expect((await get('http://app/main.js')).status).toBe(404);
  });

  it('rejects methods other than GET and HEAD', async () => {
    const response = await handle(new Request('dude-app://app/main.js', { method: 'POST', body: 'x' }));
    expect(response.status).toBe(405);
  });

  it('answers HEAD without a body', async () => {
    const response = await get('dude-app://app/main.js', 'HEAD');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('returns 404 for a missing asset with an extension', async () => {
    expect((await get('dude-app://app/missing.js')).status).toBe(404);
  });
});
