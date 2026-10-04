import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileBoundaryFailures } from '../scripts/check-mobile-boundaries.mjs';

const manifest = { name: '@dude/mobile', dependencies: { 'react-native': '*', '@dude/tool-engine': '*', '@dude/tool-registry': '*', '@dude/domain': '*' } };
const check = source => mobileBoundaryFailures('apps/mobile/app/example.tsx', source, manifest);

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
