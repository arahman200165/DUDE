import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import nodeFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import * as git from 'isomorphic-git';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { TestBed } from '@angular/core/testing';
import { scanFileList } from "@dude/tool-engine/tools/directory-diff/directory-tree-scan";
import { buildInMemoryFs } from "@dude/tool-engine/tools/git-diff/git-fs-shim";
import { buildNativeFsClient } from './git-native-fs-client';
import { toInMemoryRepoFiles } from "@dude/tool-engine/tools/git-diff/git-web-files";
import { diffCommitFiles, diffFileContent, listCommits } from "@dude/tool-engine/tools/git-diff/git-diff-service";

function repoFiles(root: string): FileList {
  const files: File[] = [];
  function walk(dir: string): void {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const path = relative(root, full).split(sep).join('/');
        const file = new File([new Uint8Array(readFileSync(full))], name);
        Object.defineProperty(file, 'webkitRelativePath', { value: `uploaded-repo/${path}` });
        files.push(file);
      }
    }
  }
  walk(root);
  return files as unknown as FileList;
}

describe('Git Diff: web/desktop adapter parity', () => {
  it('reads and diffs the same real repository through folder upload and the fake native bridge', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dude-git-parity-'));
    try {
      const author = { name: 'Parity', email: 'parity@example.com' };
      await git.init({ fs: nodeFs, dir: root, defaultBranch: 'main' });
      writeFileSync(join(root, 'readme.txt'), 'before\n');
      await git.add({ fs: nodeFs, dir: root, filepath: 'readme.txt' });
      const before = await git.commit({ fs: nodeFs, dir: root, message: 'before', author });
      writeFileSync(join(root, 'readme.txt'), 'after\n');
      await git.add({ fs: nodeFs, dir: root, filepath: 'readme.txt' });
      const after = await git.commit({ fs: nodeFs, dir: root, message: 'after', author });

      const web = buildInMemoryFs(await toInMemoryRepoFiles(scanFileList(repoFiles(root))));
      const bridge = fakeElectronBridge({
        fs: {
          ...fakeElectronBridge().fs,
          pickDirectory: async () => ({ canceled: false, rootPath: root, rootName: 'repo' }),
          walk: async () => ({ ok: true, entries: [] }),
          readFile: async (_root, path) => {
            const data = readFileSync(join(root, path));
            return { ok: true, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer };
          },
          readdir: async (_root, path) => ({ ok: true, names: readdirSync(join(root, path)) }),
          stat: async (_root, path, follow) => {
            const value = (follow ? statSync : nodeFs.lstatSync)(join(root, path));
            return { ok: true, stat: { isFile: value.isFile(), isDirectory: value.isDirectory(), isSymbolicLink: value.isSymbolicLink(), size: value.size, mtimeMs: value.mtimeMs } };
          },
        },
      });
      Object.defineProperty(window, 'dude', { configurable: true, value: bridge });
      const desktop = buildNativeFsClient(TestBed.runInInjectionContext(() => new NativeFsService()), root);
      expect(await listCommits(web, '/')).toEqual(await listCommits(desktop, '/'));
      expect(await diffCommitFiles(web, '/', before, after)).toEqual(await diffCommitFiles(desktop, '/', before, after));
      expect(await diffFileContent(web, '/', before, after, 'readme.txt')).toEqual(
        await diffFileContent(desktop, '/', before, after, 'readme.txt'),
      );
    } finally {
      Reflect.deleteProperty(window, 'dude');
      rmSync(root, { recursive: true, force: true });
    }
  });
});
