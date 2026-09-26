// Keeps NSIS file registration in sync with colocated desktopOpen manifests.
// Existing bit assignments are retained across additions so saved installer masks survive upgrades.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installerPath = path.join(root, 'build/installer.nsh');
const toolsPath = path.join(root, 'src/app/tools');
const raw = readFileSync(installerPath, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const active = new Set();

function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith('.manifest.ts')) {
      const source = readFileSync(full, 'utf8');
      const open = source.match(/desktopOpen:\s*\{([^}]+)\}/s)?.[1];
      const extensionList = open?.match(/extensions:\s*\[([^\]]*)\]/s)?.[1];
      if (!extensionList) continue;
      for (const match of extensionList.matchAll(/['"](\.[a-z0-9]+)['"]/g)) {
        const extension = match[1].slice(1);
        if (active.has(extension)) throw new Error('Duplicate desktopOpen extension: .' + extension);
        active.add(extension);
      }
    }
  }
}
collect(toolsPath);
if (!active.size) throw new Error('No desktopOpen extensions found');

// The first run reads the old for-each block. Later runs read the generated bit ledger.
const assignments = new Map();
for (const match of raw.matchAll(/; DUDE_ASSOC_BIT ([a-z0-9]+) ([0-9]+)/g)) assignments.set(match[1], Number(match[2]));
if (!assignments.size) {
  for (const match of raw.matchAll(/!insertmacro \$\{ACTION\} "([a-z0-9]+)" ([0-9]+)/g)) assignments.set(match[1], Number(match[2]));
}
const used = new Set(assignments.values());
for (const extension of [...active].sort()) {
  if (assignments.has(extension)) continue;
  let bit = 1;
  while (used.has(bit)) bit *= 2;
  if (bit > 536870912) throw new Error('NSIS FileMask has no available bits');
  assignments.set(extension, bit);
  used.add(bit);
}
const known = [...assignments].sort((a, b) => a[1] - b[1]);
const current = known.filter(([extension]) => active.has(extension));
const mask = current.reduce((result, [, bit]) => result | bit, 0);

let output = raw;
function replaceBlock(name, lines) {
  const begin = '; BEGIN GENERATED FILE ASSOCIATIONS ' + name;
  const end = '; END GENERATED FILE ASSOCIATIONS ' + name;
  const start = output.indexOf(begin);
  const stop = output.indexOf(end);
  if (start < 0 || stop < start || output.indexOf(begin, start + 1) >= 0) throw new Error('Missing or duplicate installer markers: ' + name);
  output = output.slice(0, start) + [begin, ...lines, end].join(eol) + output.slice(stop + end.length);
}
replaceBlock('BITS', [
  '!define DUDE_ALL_EXTENSION_MASK ' + mask,
  ...known.map(([extension, bit]) => '; DUDE_ASSOC_BIT ' + extension + ' ' + bit),
]);
replaceBlock('VARS', current.map((_entry, index) => 'Var DudeExt' + index));
replaceBlock('CHECKBOXES', current.map(([extension, bit], index) =>
  '  !insertmacro DudeExtensionCheckbox $DudeExt' + index + ' ".' + extension + '" ' + (61 + 13 * Math.floor(index / 2)) + 'u ' + (index % 2 ? '52%' : '0') + ' ' + bit));
replaceBlock('SAVE', current.map(([, bit], index) => '    !insertmacro DudeSaveExtension $DudeExt' + index + ' ' + bit));
replaceBlock('ACTIVE', current.map(([extension, bit]) => '  !insertmacro ${ACTION} "' + extension + '" ' + bit));
replaceBlock('KNOWN', known.map(([extension, bit]) => '  !insertmacro ${ACTION} "' + extension + '" ' + bit));
if (output !== raw) {
  writeFileSync(installerPath, output, 'utf8');
  console.log('Regenerated installer file associations (' + current.length + ' active, ' + known.length + ' known).');
} else {
  console.log('Installer file associations already up to date (' + current.length + ' active).');
}
