import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

// Hermes exports one bundle, so "the shell entry chunk contains no tool engines" is proven on the static import graph:
// nothing reachable from app/** and src/** (outside src/tools/**) may statically import a tool engine or crypto helper.
const mobile = path.resolve('apps/mobile');
const toolsDir = path.join(mobile, 'src/tools');
const hostDir = path.join(mobile, 'src/engine-host');
const heavy = /^@dude\/(?:tool-engine\/(?:tools|shared)\/|crypto(?:\/|$))/;
const hostHelpers = new Set(['@dude/crypto/host']);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', 'android', '.expo', 'dist'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : /\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name) ? [file] : [];
  });
}
const inside = (file, dir) => !path.relative(dir, file).startsWith('..');

/** Static value imports (erased type-only imports ignored) and dynamic import() specifiers of one file. */
function moduleReferences(file) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const staticImports = [], dynamicImports = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const erased = clause && (clause.isTypeOnly || (!clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(element => element.isTypeOnly)));
      if (!erased) staticImports.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      staticImports.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      dynamicImports.push(node.arguments[0] && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : undefined);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      staticImports.push(node.arguments[0] && ts.isStringLiteral(node.arguments[0]) ? node.arguments[0].text : '<nonliteral require>');
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { staticImports, dynamicImports };
}
function resolveRelative(from, specifier) {
  const base = path.resolve(path.dirname(from), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(candidate => existsSync(candidate) && /\.tsx?$/.test(candidate));
}
const isBindingFile = file => inside(file, toolsDir) && /[\\/]([^\\/]+)[\\/]\1\.mobile-bindings\.ts$/.test(file);

test('the shell static import graph never reaches tool engines or crypto helpers other than the engine-host helper', () => {
  const shellFiles = [...walk(path.join(mobile, 'app')), ...walk(path.join(mobile, 'src'))].filter(file => !inside(file, toolsDir));
  assert.ok(shellFiles.length > 20, 'shell sources were not discovered');
  const failures = [];
  const visited = new Set();
  const queue = [...shellFiles];
  while (queue.length) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of moduleReferences(file).staticImports) {
      if (specifier.startsWith('.')) {
        const target = resolveRelative(file, specifier);
        if (!target) continue;
        // Generated binding map -> lightweight binding modules is the single permitted static edge into src/tools/**.
        if (inside(target, toolsDir) && !isBindingFile(target)) failures.push(`${path.relative(mobile, file)} statically imports tool code ${specifier}`);
        else queue.push(target);
      } else if (heavy.test(specifier)) {
        if (!(inside(file, hostDir) && hostHelpers.has(specifier))) failures.push(`${path.relative(mobile, file)} statically imports ${specifier}`);
      } else if (specifier === '@dude/tool-engine') failures.push(`${path.relative(mobile, file)} statically imports the heavy engine entrypoint`);
    }
  }
  assert.deepEqual(failures, []);
});

test('every tool binding contributes only literal lazy import() of its own screens', () => {
  const bindings = walk(toolsDir).filter(file => /\.mobile-bindings\.ts$/.test(file));
  const failures = [];
  for (const file of bindings) {
    const relative = path.relative(mobile, file);
    const id = path.basename(file).replace(/\.mobile-bindings\.ts$/, '');
    if (!isBindingFile(file)) failures.push(`${relative} must be src/tools/${id}/${id}.mobile-bindings.ts`);
    const { staticImports, dynamicImports } = moduleReferences(file);
    if (staticImports.length) failures.push(`${relative} has static value imports (${staticImports.join(', ')}); screens must load through import()`);
    if (!dynamicImports.length) failures.push(`${relative} has no lazy import()`);
    for (const specifier of dynamicImports) {
      if (specifier === undefined) failures.push(`${relative} has a nonliteral import()`);
      else if (!specifier.startsWith('./') || heavy.test(specifier) || !resolveRelative(file, specifier)) failures.push(`${relative} lazy import ${specifier} must be a literal sibling module`);
    }
  }
  assert.deepEqual(failures, []);
});

test('import extraction separates static value, erased type and lazy imports', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'mobile-lazy-'));
  try {
    const file = path.join(directory, 'sample.ts');
    writeFileSync(file, [
      "import type { A } from '@dude/crypto/base64-codec';",
      "import { type B } from '@dude/crypto/hash-compute';",
      "import { encodeBase64 } from '@dude/crypto/base64-codec';",
      "import '@dude/tool-engine/tools/x/x';",
      "export { y } from '@dude/tool-engine/shared/y';",
      "export const load = () => import('./screen');",
    ].join('\n'));
    assert.deepEqual(moduleReferences(file), {
      staticImports: ['@dude/crypto/base64-codec', '@dude/tool-engine/tools/x/x', '@dude/tool-engine/shared/y'],
      dynamicImports: ['./screen'],
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
