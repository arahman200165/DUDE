// Read-only source classification used to prepare and review the Phase 31A migration.
import ts from 'typescript';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
export const root = process.cwd();
export function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
export function source(file) { return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true); }
export function imports(sf) {
  const result = [];
  function visit(n) {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) result.push(n.moduleSpecifier);
    if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) result.push(n.argument.literal);
    if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || n.expression.getText(sf) === 'require') && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) result.push(n.arguments[0]);
    ts.forEachChild(n, visit);
  }
  visit(sf); return result;
}
export function resolveImport(file, name) {
  if (!name.startsWith('.')) return undefined;
  const base = path.resolve(path.dirname(file), name);
  return [base, base + '.ts', base + '.d.ts', path.join(base, 'index.ts')].find(p => existsSync(p));
}
const hostNames = new Set(['window','document','localStorage','sessionStorage','indexedDB','navigator','Worker','OffscreenCanvas','DOMParser','HTMLElement','HTMLCanvasElement','HTMLTextAreaElement','CanvasRenderingContext2D','ImageData','Image','FileReader','XMLSerializer','MutationObserver','ResizeObserver','Storage','Element','Node','location','self','postMessage','Event','EventTarget','DataTransfer','createImageBitmap','File','FileList','Blob']);
export function hostReasons(sf) {
  const reasons = new Set();
  const declared = new Set();
  function declarations(n) {
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isClassDeclaration(n) || ts.isImportSpecifier(n) || ts.isImportClause(n)) && n.name && ts.isIdentifier(n.name)) declared.add(n.name.text);
    ts.forEachChild(n, declarations);
  }
  declarations(sf);
  for (const imp of imports(sf)) {
    if (/^(@angular\/|electron$|node:|ws$)/.test(imp.text)) reasons.add('host import: ' + imp.text);
  }
  function visit(n) {
    const propertyName = n.parent && (ts.isPropertyAssignment(n.parent)||ts.isPropertySignature(n.parent)||ts.isMethodSignature(n.parent)||ts.isMethodDeclaration(n.parent)||ts.isPropertyDeclaration(n.parent)) && n.parent.name === n;
    if (ts.isIdentifier(n) && (hostNames.has(n.text)||/^HTML.*Element$/.test(n.text)) && !declared.has(n.text) && !(n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) && !propertyName) reasons.add('host API: ' + n.text);
    ts.forEachChild(n, visit);
  }
  visit(sf); return [...reasons];
}
export function classify() {
  const all = files(path.join(root, 'apps/web/src')).filter(p => p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('.worker.ts') && !p.endsWith('.manifest.ts'));
  const map = new Map(all.map(p => [p, { file: p, sf: source(p), reasons: [] }]));
  for (const item of map.values()) item.reasons = hostReasons(item.sf);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of map.values()) {
      if (item.reasons.length) continue;
      for (const imp of imports(item.sf)) {
        const dep = resolveImport(item.file, imp.text);
        if (dep?.endsWith('.ts') && (!map.has(dep) || map.get(dep).reasons.length)) {
          item.reasons.push('host dependency: ' + path.relative(root, dep)); changed = true; break;
        }
      }
    }
  }
  return map;
}
if (process.argv.includes('--report')) {
  const map = classify();
  console.log('Portable modules:', [...map.values()].filter(x => !x.reasons.length).length);
  console.log([...map.values()].filter(x => x.reasons.length && !/\.service\.|\.workspace-step\.|[\\/]shell[\\/]|\.settings\.|[\\/]components[\\/]/.test(x.file) && !x.sf.text.includes('@angular/')).map(x => ({ source: path.relative(root, x.file), reasons: x.reasons })).slice(0, 100));
}
