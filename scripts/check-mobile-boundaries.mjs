import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { imports } from './phase31a-inventory.mjs';

const nodeModules = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const hostWorkspaces = new Set(['web', 'desktop', 'hub', 'device-agent', 'sqlite-store', 'agent-pipe', 'collab-relay', 'collab-protocol']);
const hostGlobals = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'indexedDB', 'DOMParser', 'HTMLElement', 'HTMLCanvasElement', 'OffscreenCanvas', 'FileReader', 'XMLSerializer', 'Worker', 'process', 'Buffer', '__dirname', '__filename']);
const searchExport = '@dude/tool-engine/core/registry/tool-search';
const packageName = name => name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0];

export function mobileBoundaryFailures(file, text, manifest, mobileRoot = 'apps/mobile') {
  const failures = [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declared = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const imp of imports(sf)) {
    const name = packageName(imp.text);
    if (imp.text.startsWith('.')) {
      const relative = path.relative(path.resolve(mobileRoot), path.resolve(path.dirname(file), imp.text));
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) failures.push(`${file}: mobile sources must consume package exports, not ${imp.text}`);
      continue;
    }
    if (imp.text.startsWith('node:') || nodeModules.has(imp.text)) failures.push(`${file}: Node-only import ${imp.text}`);
    else if (!declared[name] && name !== manifest.name) failures.push(`${file}: undeclared mobile dependency ${name}`);
    if (name.startsWith('@angular/') || name === 'electron' || name.startsWith('electron-') || name === 'ws' || name === 'better-sqlite3' || hostWorkspaces.has(name.replace('@dude/', ''))) failures.push(`${file}: forbidden mobile host dependency ${imp.text}`);
    if (name === '@dude/tool-engine' && imp.text !== searchExport) failures.push(`${file}: shell cannot import tool execution (${imp.text}); tools start in Phase 31I`);
    if (imp.text.startsWith('@dude/') && /\/(src|dist)(\/|$)/.test(imp.text)) failures.push(`${file}: use the public package export (${imp.text})`);
  }
  function visit(node) {
    if (ts.isElementAccessExpression(node) && ['globalThis', 'global', 'self'].includes(node.expression.getText(sf)) && ts.isStringLiteral(node.argumentExpression) && hostGlobals.has(node.argumentExpression.text)) failures.push(`${file}: host global ${node.argumentExpression.text} is unavailable in mobile source`);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      if (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0])) failures.push(`${file}: nonliteral module loading cannot be boundary checked`);
      if (ts.isIdentifier(node.expression)) failures.push(`${file}: Node require is unavailable in mobile source`);
    }
    if (ts.isIdentifier(node) && hostGlobals.has(node.text)) {
      const parent = node.parent;
      const propertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node && !['globalThis', 'global', 'self'].includes(parent.expression.getText(sf))) || ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === node);
      if (!propertyName) failures.push(`${file}: host global ${node.text} is unavailable in mobile source`);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return [...new Set(failures)];
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', 'android', '.expo', 'dist', 'plugins'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) && !/\.spec\.tsx?$/.test(file) ? [file] : [];
  });
}

export function checkMobileBoundaries(root = 'apps/mobile') {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const failures = sourceFiles(root).flatMap(file => mobileBoundaryFailures(file, readFileSync(file, 'utf8'), manifest, root));
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (name.startsWith('@angular/') || name === 'electron' || hostWorkspaces.has(name.replace('@dude/', '')) || nodeModules.has(name)) failures.push(`${root}/package.json: forbidden mobile dependency ${name}`);
  }
  const config = JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
  if (Object.keys(config.compilerOptions?.paths ?? {}).length) failures.push(`${root}/tsconfig.json: consume compiled package exports without source aliases`);
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const failures = checkMobileBoundaries();
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('Mobile TypeScript/TSX dependency, host and compiled-package boundaries pass.');
}
