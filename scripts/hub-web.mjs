// Shared by build-hub-sea.mjs and stage-hub.mjs: make sure the Hub web build (dist/hub-web/browser) exists,
// copy it into a service/web directory and precompress it for the Hub's static handler.
//
// Packaging never silently ships a Hub without its web UI: a missing build is built with `npm run build:hub-web`,
// unless DUDE_SKIP_HUB_WEB=1, in which case packaging fails with a clear message.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { compressStatic } from './compress-static.mjs';

const root = path.resolve(import.meta.dirname, '..');
export const HUB_WEB_DIR = path.join(root, 'dist', 'hub-web', 'browser');

export function ensureHubWeb() {
  if (existsSync(path.join(HUB_WEB_DIR, 'index.html'))) return HUB_WEB_DIR;
  if (process.env.DUDE_SKIP_HUB_WEB === '1') {
    throw new Error(
      `dist/hub-web/browser is missing and DUDE_SKIP_HUB_WEB=1 forbids building it. Run "npm run build:hub-web" first, or unset DUDE_SKIP_HUB_WEB.`,
    );
  }
  console.log('dist/hub-web/browser not found; running "npm run build:hub-web"...');
  const result = spawnSync('npm run build:hub-web', { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0 || !existsSync(path.join(HUB_WEB_DIR, 'index.html'))) {
    throw new Error('"npm run build:hub-web" failed; refusing to package a Hub without its web UI.');
  }
  return HUB_WEB_DIR;
}

/** Copies the Hub web build to `target` (replacing it) and writes .br/.gz variants there. Returns the compression summary. */
export function installHubWeb(target) {
  const source = ensureHubWeb();
  rmSync(target, { recursive: true, force: true });
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
  const summary = compressStatic(target);
  console.log(`Copied web assets to ${path.relative(root, target)} (+${summary.br} .br, +${summary.gz} .gz)`);
  return summary;
}
