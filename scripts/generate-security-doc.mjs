// Generates SECURITY.md's High-Consequence Tool Matrix and capability-disclosure tables from
// the distributed packages/tool-registry/src/tools/<id>/<id>.manifest.ts files (DUDE_PRD.md §21 Phase 23 Items 7 & 13)
// — network capability, persistence policy, and consequence classification derived from
// manifest metadata rather than hand-maintained prose that drifts from the real registry.
//
// Mirrors scripts/generate-readme-tools.mjs's approach exactly: walk manifests, regex-extract
// the fields this doc needs, regenerate one fenced section of SECURITY.md in place.
//
// Also regenerates the Web Capability Matrix (DUDE_PRD.md §21 Phase 26 Item 6) — from each
// manifest's closed-vocabulary `capabilities` — into SECURITY.md and README.md's fenced
// `<!-- capability-matrix:start/end -->` block, so the web/desktop split is disclosed from the
// same metadata the conformance harness enforces against real imports.
//
// Usage: node scripts/generate-security-doc.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifests } from './tool-manifests.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(ROOT, 'packages/tool-registry/src/tools');
const SECURITY_PATH = path.join(ROOT, 'SECURITY.md');
const README_PATH = path.join(ROOT, 'README.md');
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
  'remote-write': 'Remote Write',
  'system-config': 'System Configuration',
};

// Mirrors packages/contracts/src/core/platform/capability-catalog.ts's labels (kept in sync by security-doc.spec.ts).
const PLATFORM_CAPABILITY_LABELS = {
  'native-fs': 'Native filesystem access',
  'native-fs-write': 'Native filesystem write',
  'file-watch': 'File watching',
  'llm-proxy': 'Local LLM chat',
  'collab-relay': 'Collaboration relay',
  'secure-keychain': 'OS keychain storage',
  'native-network': 'Native network diagnostics',
  'native-system': 'Native Windows system access',
  'native-system-write': 'Native Windows system changes',
};
const RUNTIME_LABELS = {
  pyodide: 'Pyodide (Python/WASM)',
  sqljs: 'sql.js (SQLite/WASM)',
  xmllint: 'xmllint (libxml2/WASM)',
  ejs: 'EJS template engine',
};
const WEB_LABELS = {
  fallback: 'Works — weaker browser fallback',
  unavailable: 'Desktop-only feature',
};

function extractCapabilities(text) {
  const block = text.match(/capabilities:\s*\[([\s\S]*?)\],\n/);
  if (!block) return { platform: [], runtimes: [] };
  const entries = [...block[1].matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  const platform = [];
  const runtimes = [];
  for (const entry of entries) {
    const kind = extractField(entry, 'kind');
    if (kind === 'platform') {
      platform.push({ id: extractField(entry, 'id'), web: extractField(entry, 'web'), note: extractField(entry, 'note') });
    } else if (kind === 'runtime') {
      runtimes.push(extractField(entry, 'runtime'));
    }
  }
  return { platform, runtimes };
}

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

const tools = readManifests().map(({metadata: m}) => ({
  ...m, status: m.status ?? 'experimental', verificationSummary: m.verification?.summary,
  consequenceClass: m.consequenceClass ?? [], networkRequired: m.network?.required ?? false,
  networkDetail: m.network?.detail, persistenceInput: m.persistence.input,
  persistencePreferences: m.persistence.preferences, desktopOpen: !!m.desktopOpen,
  capabilities: { platform: (m.capabilities ?? []).filter(c => c.kind === 'platform'),
    runtimes: (m.capabilities ?? []).filter(c => c.kind === 'runtime').map(c => c.runtime) },
}));

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

const usesKeychain = (tool) =>
  tool.persistenceInput === 'secure-local' ||
  tool.persistencePreferences === 'secure-local' ||
  tool.capabilities.platform.some((c) => c.id === 'secure-keychain');

const nativeRows = tools
  .filter((tool) => tool.desktopOpen || usesKeychain(tool) || tool.capabilities.platform.length > 0)
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((tool) => {
    const capabilities = [];
    if (tool.desktopOpen) capabilities.push('Desktop file/folder open');
    for (const capability of tool.capabilities.platform) {
      if (capability.id !== 'secure-keychain') capabilities.push(PLATFORM_CAPABILITY_LABELS[capability.id] ?? capability.id);
    }
    if (usesKeychain(tool)) capabilities.push('OS keychain storage (Electron only)');
    return `| ${link(tool)} | ${capabilities.join('; ')} |`;
  });

const capabilityRows = tools
  .flatMap((tool) => tool.capabilities.platform.map((capability) => ({ tool, capability })))
  .sort((a, b) => a.tool.id.localeCompare(b.tool.id) || a.capability.id.localeCompare(b.capability.id))
  .map(
    ({ tool, capability }) =>
      `| ${link(tool)} | ${PLATFORM_CAPABILITY_LABELS[capability.id] ?? capability.id} | ${WEB_LABELS[capability.web] ?? capability.web} | ${capability.note} |`,
  );

const runtimeRows = tools
  .flatMap((tool) => tool.capabilities.runtimes.map((runtime) => ({ tool, runtime })))
  .sort((a, b) => a.tool.id.localeCompare(b.tool.id))
  .map(({ tool, runtime }) => `| ${link(tool)} | ${RUNTIME_LABELS[runtime] ?? runtime} |`);

const capabilityMatrix = `Every tool not listed here behaves identically on the web companion and the desktop app.

| Tool | Desktop capability | On the web | What desktop adds |
| --- | --- | --- | --- |
${capabilityRows.join('\n')}

Optional runtimes are cached on demand by the web service worker the first time the tool needs
them (never prefetched), and ship locally inside the desktop app.

| Tool | Optional runtime |
| --- | --- |
${runtimeRows.join('\n')}`;

const content = `# Security & Capability Disclosure

Generated from \`packages/tool-registry/src/tools/<id>/<id>.manifest.ts\` metadata by \`scripts/generate-security-doc.mjs\`
(DUDE_PRD.md §21 Phase 23 Items 7 & 13) — do not hand-edit the tables below; edit the source
manifests and run \`npm run generate:registry\`.

Every tool in DUDE runs its transform entirely client-side unless a table below says otherwise.
"Verified" status and its cross-check/vector summary are defined in \`ADDING_A_TOOL.md\`'s
"Status & confidence tiers" section — a summary here is what was actually tested, not a
certification claim.

## High-Consequence Tool Matrix

Tools whose function is cryptography, authentication material, arbitrary code execution, secret
handling, or network scanning — the categories DUDE_PRD.md §21 Phase 23 calls out as needing a
stronger bar than "the UI appears to work" — plus HTTP requests that can change server state
(\`remote-write\`, added in Phase 27) and changes to local files (\`filesystem-write\`, added in
Phase 29 — always through the preview → confirm → journal/undo mutation engine).
Categories reserved for capabilities DUDE does not ship yet (registry, system-config,
database-write) have no rows below until a tool claims them.

| Tool | Consequence class | Status |
| --- | --- | --- |
${matrixRows.join('\n')}

## Network-Capable Tools

Every other tool processes data entirely locally and makes no network request.

| Tool | What it contacts |
| --- | --- |
${networkRows.join('\n')}

## Native/Desktop-Privileged Tools

Tools that use a desktop-only native capability (Electron file/folder picker, native filesystem
access, the local LLM chat bridge, the collaboration server, or OS-keychain-backed storage) beyond the
browser sandbox.

| Tool | Native capability |
| --- | --- |
${nativeRows.join('\n')}

## Network Listeners

Processes that accept inbound connections:

| Process | Binds | Notes |
| --- | --- | --- |
| Collaboration server (desktop, opt-in) | \`0.0.0.0\` | The LAN collaboration server is the deliberate exception to loopback-only binding in the desktop app. |
| DUDE Hub service (self-hosted, separate install) | \`127.0.0.1:47600\` by default | HTTPS only, with a certificate whose SPKI hash enrolled devices pin (a built-in local CA by default for new Hubs; self-signed, imported or ACME otherwise). Binds \`0.0.0.0\` only when the owner enables LAN mode through the installer or an elevated CLI command, or in container mode, where it binds \`0.0.0.0\` inside the container and the host decides which ports are published. Its WebSockets (\`/api/v1/realtime\` and, from Phase 31J, \`/api/v1/collab\`) share this listener and authenticate before the upgrade; no other port is opened. When the owner turns on the managed Cloudflare Tunnel (32-SS1, Windows only, elevated command), the Hub also supervises a hash-pinned \`cloudflared\` child that makes outbound connections to Cloudflare and listens only on a loopback metrics port; the Hub itself then stays on loopback and Cloudflare terminates TLS for the owner's domain. When the owner configures Google sign-in (32-SS1, \`hub.json\` \`oidc\` block plus a client secret in the Hub secret store), the Hub itself makes outbound HTTPS requests to exactly \`accounts.google.com\`, \`oauth2.googleapis.com\` and \`www.googleapis.com\` (discovery, signing keys and the token exchange); no other outbound host, no redirect to another host, and nothing is contacted while the block is absent. When the owner connects a Google Drive backup destination (32-SS1, Milestone 856, elevated commands), the Hub also makes outbound HTTPS requests to exactly \`oauth2.googleapis.com\` (the token exchange, refresh and revocation) and \`www.googleapis.com\` (the Drive API, under the narrow \`drive.file\` scope: only the one folder it created), and its \`/api/v1/backup/drive/callback\` accepts Google's redirect only while a connect is waiting; no other outbound host, no redirect to another host, and nothing is contacted while no Drive destination is configured. When the owner connects a OneDrive backup destination (32-SS1, Milestone 857, elevated commands), the Hub also makes outbound HTTPS requests to exactly \`login.microsoftonline.com\` (the token exchange and refresh) and \`graph.microsoft.com\` (Microsoft Graph, under the narrow \`Files.ReadWrite.AppFolder\` scope: only the one folder it created inside its own app folder), plus the short-lived pre-authenticated upload and download addresses Graph hands back on Microsoft's own file hosts (https only, a fixed host-suffix allowlist, never an IP literal, no credential sent to them), and its \`/api/v1/backup/onedrive/callback\` accepts Microsoft's redirect only while a connect is waiting; no other outbound host, no redirect to another host, and nothing is contacted while no OneDrive destination is configured. |

DUDE does not operate a Hub; every Hub is run and owned by the user.

## Web Capability Matrix

${capabilityMatrix}
`;

// Plain `\n` -- the committed blob is LF (git normalizes on commit regardless of a Windows
// author's local checkout), and forcing `\r\n` here made every line differ from that blob on a
// Linux CI runner (no autocrlf conversion in play), failing the "up to date" staleness check
// even when the content itself hadn't changed at all.
writeFileSync(SECURITY_PATH, content, 'utf8');

const README_BLOCK = /(<!-- capability-matrix:start -->\n)[\s\S]*?(\n<!-- capability-matrix:end -->)/;
const readme = readFileSync(README_PATH, 'utf8').replace(/\r\n/g, '\n');
if (!README_BLOCK.test(readme)) throw new Error('README.md is missing the <!-- capability-matrix:start/end --> block');
writeFileSync(README_PATH, readme.replace(README_BLOCK, (_m, start, end) => `${start}${capabilityMatrix}${end}`), 'utf8');
console.log(
  `Regenerated SECURITY.md: ${matrixRows.length} high-consequence rows, ${networkRows.length} network-capable tools, ${nativeRows.length} native-privileged tools, ${capabilityRows.length + runtimeRows.length} capability-matrix rows.`,
);
