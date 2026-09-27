// Generates SECURITY.md's High-Consequence Tool Matrix and capability-disclosure tables from
// the distributed src/app/tools/**/<id>.manifest.ts files (DUDE_PRD.md §21 Phase 23 Items 7 & 13)
// — network capability, persistence policy, and consequence classification derived from
// manifest metadata rather than hand-maintained prose that drifts from the real registry.
//
// Mirrors scripts/generate-readme-tools.mjs's approach exactly: walk manifests, regex-extract
// the fields this doc needs, regenerate one fenced section of SECURITY.md in place.
//
// Usage: node scripts/generate-security-doc.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'src/app/tools');
const SECURITY_PATH = path.join(ROOT, 'SECURITY.md');
const BASE_URL = 'https://arahman200165.github.io/DUDE';

const CONSEQUENCE_LABELS = {
  crypto: 'Crypto',
  authentication: 'Authentication',
  'code-execution': 'Code Execution',
  'filesystem-write': 'Filesystem Write',
  'process-management': 'Process Management',
  registry: 'Registry',
  'network-scanning': 'Network Scanning',
  'database-write': 'Database Write',
  'secret-management': 'Secret Management',
};

function findManifests(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findManifests(full));
    } else if (entry.isFile() && entry.name.endsWith('.manifest.ts')) {
      results.push(full);
    }
  }
  return results;
}

function unescapeQuoted(str) {
  return str.replace(/\\(.)/g, '$1');
}

function extractField(text, field) {
  const match =
    text.match(new RegExp(`${field}:\\s*'((?:[^'\\\\]|\\\\.)*)'`)) ??
    text.match(new RegExp(`${field}:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return match ? unescapeQuoted(match[1]) : undefined;
}

function extractStringArray(text, field) {
  const match = text.match(new RegExp(`${field}:\\s*\\[([^\\]]*)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => unescapeQuoted(m[1]));
}

function extractNestedField(text, group, field) {
  const groupMatch = text.match(new RegExp(`${group}:\\s*\\{([^}]*)\\}`));
  if (!groupMatch) return undefined;
  return extractField(groupMatch[1], field);
}

function extractNestedBoolean(text, group, field) {
  const groupMatch = text.match(new RegExp(`${group}:\\s*\\{([^}]*)\\}`));
  if (!groupMatch) return undefined;
  const match = groupMatch[1].match(new RegExp(`${field}:\\s*(true|false)`));
  return match ? match[1] === 'true' : undefined;
}

const manifestPaths = findManifests(TOOLS_DIR);
const tools = manifestPaths
  .map((manifestPath) => {
    const text = readFileSync(manifestPath, 'utf8');
    return {
      id: extractField(text, 'id'),
      title: extractField(text, 'title'),
      route: extractField(text, 'route'),
      status: extractField(text, 'status') ?? 'experimental',
      verificationSummary: extractNestedField(text, 'verification', 'summary'),
      consequenceClass: extractStringArray(text, 'consequenceClass'),
      networkRequired: extractNestedBoolean(text, 'network', 'required') ?? false,
      networkDetail: extractNestedField(text, 'network', 'detail'),
      persistenceInput: extractNestedField(text, 'persistence', 'input'),
      persistencePreferences: extractNestedField(text, 'persistence', 'preferences'),
      desktopOpen: /desktopOpen:\s*\{/.test(text),
    };
  })
  .filter((tool) => tool.id !== 'settings');

const link = (tool) => `[${tool.title}](${BASE_URL}${tool.route})`;

const matrixRows = tools
  .filter((tool) => tool.consequenceClass.length > 0)
  .sort((a, b) => a.id.localeCompare(b.id))
  .flatMap((tool) =>
    tool.consequenceClass.map(
      (cls) =>
        `| ${link(tool)} | ${CONSEQUENCE_LABELS[cls] ?? cls} | ${tool.status}${tool.verificationSummary ? ` — ${tool.verificationSummary}` : ''} |`,
    ),
  );

const networkRows = tools
  .filter((tool) => tool.networkRequired)
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((tool) => `| ${link(tool)} | ${tool.networkDetail ?? 'required'} |`);

const nativeRows = tools
  .filter((tool) => tool.desktopOpen || tool.persistenceInput === 'secure-local' || tool.persistencePreferences === 'secure-local')
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((tool) => {
    const capabilities = [];
    if (tool.desktopOpen) capabilities.push('Desktop file/folder open');
    if (tool.persistenceInput === 'secure-local' || tool.persistencePreferences === 'secure-local') {
      capabilities.push('OS keychain storage (Electron only)');
    }
    return `| ${link(tool)} | ${capabilities.join('; ')} |`;
  });

const content = `# Security & Capability Disclosure

Generated from \`src/app/tools/**/<id>.manifest.ts\` metadata by \`scripts/generate-security-doc.mjs\`
(DUDE_PRD.md §21 Phase 23 Items 7 & 13) — do not hand-edit the tables below; edit the source
manifests and run \`npm run generate:registry\`.

Every tool in DUDE runs its transform entirely client-side unless a table below says otherwise.
"Verified" status and its cross-check/vector summary are defined in \`ADDING_A_TOOL.md\`'s
"Status & confidence tiers" section — a summary here is what was actually tested, not a
certification claim.

## High-Consequence Tool Matrix

Tools whose function is cryptography, authentication material, arbitrary code execution, or
secret handling — the categories DUDE_PRD.md §21 Phase 23 calls out as needing a stronger bar
than "the UI appears to work". Categories reserved for capabilities DUDE does not ship yet
(filesystem-write, process-management, registry, network-scanning, database-write) have no rows
below until a Phase 27+ tool actually claims them.

| Tool | Consequence class | Status |
| --- | --- | --- |
${matrixRows.join('\n')}

## Network-Capable Tools

Every other tool processes data entirely locally and makes no network request.

| Tool | What it contacts |
| --- | --- |
${networkRows.join('\n')}

## Native/Desktop-Privileged Tools

Tools that use a desktop-only native capability (Electron file/folder picker, or OS-keychain-backed
storage) beyond the browser sandbox. All other tools run identically on the web companion and the
desktop app.

| Tool | Native capability |
| --- | --- |
${nativeRows.join('\n')}
`;

// Plain `\n` -- the committed blob is LF (git normalizes on commit regardless of a Windows
// author's local checkout), and forcing `\r\n` here made every line differ from that blob on a
// Linux CI runner (no autocrlf conversion in play), failing the "up to date" staleness check
// even when the content itself hadn't changed at all.
writeFileSync(SECURITY_PATH, content, 'utf8');
console.log(
  `Regenerated SECURITY.md: ${matrixRows.length} high-consequence rows, ${networkRows.length} network-capable tools, ${nativeRows.length} native-privileged tools.`,
);
