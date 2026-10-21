import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileBoundaryFailures } from '../scripts/check-mobile-boundaries.mjs';
import { bundleSourceFailures } from '../scripts/check-mobile-bundle.mjs';

const manifest = { name: '@dude/mobile', dependencies: { 'react-native': '*', '@dude/tool-engine': '*', '@dude/tool-registry': '*', '@dude/domain': '*', '@dude/crypto': '*', '@dude/contracts': '*' } };
const checkAt = file => source => mobileBoundaryFailures(file, source, manifest);
const check = checkAt('apps/mobile/app/example.tsx');
const checkTool = checkAt('apps/mobile/src/tools/base64/base64-screen.tsx');
const checkHost = checkAt('apps/mobile/src/engine-host/mobile-engine-host.ts');

test('TSX shell can consume compiled registry and lightweight search exports', () => {
  assert.deepEqual(check("import { Text } from 'react-native'; import { TOOL_METADATA } from '@dude/tool-registry'; import { searchTools } from '@dude/tool-engine/core/registry/tool-search'; export const screen = <Text>{TOOL_METADATA.length}</Text>;"), []);
});

test('rejects host, undeclared, source and heavy engine imports in TSX', () => {
  for (const imported of ['@angular/core', 'electron', 'node:fs', 'fs/promises', '@dude/sqlite-store', '@dude/agent-pipe', '@dude/device-agent', '@dude/hub', '@dude/tool-engine', '@dude/tool-engine/tools/base64/base64.pipeline-step', '@dude/domain/src/index', '../../../packages/domain/src/index', 'undeclared-library']) {
    assert.ok(check(`import anything from '${imported}'; export const screen = <Text />;`).length, imported);
  }
});

test('rejects DOM/browser storage and Node globals, including globalThis access', () => {
  for (const expression of ['document.createElement("div")', 'window.location', 'localStorage.getItem("key")', 'indexedDB.open("cache")', 'globalThis.document', 'globalThis["window"]', 'process.env', 'Buffer.from("key")']) {
    assert.ok(check(`export const value = ${expression};`).length, expression);
  }
});

test('rejects nonliteral loaders and requires, including erased type imports', () => {
  assert.ok(check('const name = "module"; import(name);').length);
  assert.ok(check('const module = require("react-native");').length);
  assert.ok(check("import type { BrowserWindow } from 'electron';").length);
});

test('shell may import the search and paste-detect subpaths but no tool engine or crypto', () => {
  assert.deepEqual(check("import { detectShapes } from '@dude/tool-engine/core/paste-detect/paste-detect'; export const x = detectShapes;"), []);
  for (const imported of ['@dude/tool-engine/tools/base64/base64-codec', '@dude/tool-engine/shared/code-sandbox/code-sandbox-client', '@dude/crypto/base64-codec', '@dude/crypto/host', '@dude/crypto']) {
    assert.ok(check(`import anything from '${imported}'; export const x = anything;`).length, imported);
  }
});

test('lazily bound tool modules may import tool engine tools/shared and crypto subpaths', () => {
  assert.deepEqual(checkTool("import { encodeBase64 } from '@dude/crypto/base64-codec'; import { x } from '@dude/tool-engine/tools/base64/base64-logic'; import { y } from '@dude/tool-engine/shared/text/helper'; export const z = [encodeBase64, x, y];"), []);
  for (const imported of ['@dude/tool-engine', '@dude/crypto', '@angular/core', 'node:fs', '@dude/sqlite-store', '@dude/tool-engine/tools/base64/src/base64', '../../../../../packages/crypto/src/host']) {
    assert.ok(checkTool(`import anything from '${imported}'; export const x = anything;`).length, imported);
  }
  assert.ok(checkTool('export const x = document.title;').length);
});

test('the engine host imports only the contract and crypto host helpers, never tool engines', () => {
  assert.deepEqual(checkHost("import type { EngineHostPorts } from '@dude/contracts/engine-host'; import { installEngineHost } from '@dude/crypto/host'; export const x = installEngineHost;"), []);
  for (const imported of ['@dude/tool-engine/tools/hash/hash-tool', '@dude/tool-engine/shared/x', '@dude/tool-engine/core/registry/tool-search', '@dude/crypto/base64-codec', '@dude/crypto']) {
    assert.ok(checkHost(`import anything from '${imported}'; export const x = anything;`).length, imported);
  }
});

test('production bundle sources reject host dependencies and workspaces independently but allow tool engines', () => {
  assert.deepEqual(bundleSourceFailures(['../../packages/tool-engine/dist/tools/base64/base64-logic.js', '../../packages/crypto/dist/host.js', '../../node_modules/@noble/hashes/sha2.js']), []);
  for (const source of ['../../node_modules/@angular/core/fesm2022/core.mjs', '../../node_modules/electron/index.js', '../../node_modules/ws/index.js', '../../node_modules/better-sqlite3/lib/index.js', '../../apps/web/src/main.ts', '../../apps/desktop/main.js', '../../packages/sqlite-store/dist/index.js', '..\\..\\apps\\hub\\src\\server.ts', '../../packages/persistence/dist/browser-store.js']) {
    assert.deepEqual(bundleSourceFailures([source]), [source.replaceAll('\\', '/')], source);
  }
});
