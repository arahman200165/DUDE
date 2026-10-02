import { sep } from 'node:path';
import { resolveWithinRoot } from './static-server';

// resolveWithinRoot is the one guard standing between a renderer-supplied path and the real
// filesystem for both the desktop static server and fs-bridge.ts's native file-access IPC
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
