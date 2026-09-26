// One-time codemod (Milestone 300): splits the monolithic TOOL_DEFINITIONS array in
// src/app/core/registry/tool-definitions.ts into one colocated <id>.manifest.ts file per
// tool folder under src/app/tools/. After running this and verifying with
// generate-tool-registry.mjs, this script (and this comment) can be deleted — it is not
// part of the ongoing "add a tool" workflow.
//
// Usage: node scripts/migrate-manifests.mjs

import ts from 'typescript';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REGISTRY_FILE = path.join(ROOT, 'src/app/core/registry/tool-definitions.ts');
const TOOLS_DIR = path.join(ROOT, 'src/app/tools');

const sourceText = readFileSync(REGISTRY_FILE, 'utf8');
const sourceFile = ts.createSourceFile(REGISTRY_FILE, sourceText, ts.ScriptTarget.Latest, true);

let arrayLiteral;
ts.forEachChild(sourceFile, (node) => {
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.name.text === 'TOOL_DEFINITIONS' &&
        decl.initializer &&
        ts.isArrayLiteralExpression(decl.initializer)
      ) {
        arrayLiteral = decl.initializer;
      }
    }
  }
});

if (!arrayLiteral) {
  throw new Error('Could not find "export const TOOL_DEFINITIONS = [...]" array literal');
}

const entries = arrayLiteral.elements.filter(ts.isObjectLiteralExpression);
console.log(`Found ${entries.length} entries in TOOL_DEFINITIONS`);

let migrated = 0;
const ids = new Set();

for (const entry of entries) {
  const idProp = entry.properties.find(
    (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'id',
  );
  if (!idProp || !ts.isStringLiteral(idProp.initializer)) {
    throw new Error(`Entry at position ${entry.getStart(sourceFile)} has no string "id" property`);
  }
  const id = idProp.initializer.text;
  if (ids.has(id)) throw new Error(`Duplicate id encountered during migration: ${id}`);
  ids.add(id);

  const toolDir = path.join(TOOLS_DIR, id);
  if (!existsSync(toolDir)) {
    throw new Error(`Expected tool folder not found for id "${id}": ${toolDir}`);
  }

  let entryText = sourceText.slice(entry.getStart(sourceFile), entry.getEnd());

  const importPrefix = `../../tools/${id}/`;
  if (entryText.includes(importPrefix)) {
    entryText = entryText.split(importPrefix).join('./');
  } else {
    const match = entryText.match(/\.\.\/\.\.\/tools\/([^/']+)\//);
    if (!match) {
      throw new Error(`Entry "${id}" has no "../../tools/<folder>/" import path to rewrite`);
    }
    console.warn(`  [${id}] load path folder ("${match[1]}") differs from id — rewriting to "./" anyway`);
    entryText = entryText.split(`../../tools/${match[1]}/`).join('./');
  }

  const manifestPath = path.join(toolDir, `${id}.manifest.ts`);
  const content = [
    "import type { ToolDefinition } from '../../shared/models/tool-definition.model';",
    '',
    `export const manifest: ToolDefinition = ${entryText};`,
    '',
  ].join('\n');
  writeFileSync(manifestPath, content, 'utf8');
  migrated += 1;
}

console.log(`Wrote ${migrated} manifest files under src/app/tools/**/<id>.manifest.ts`);
