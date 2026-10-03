// Source-backed inventory only. It never changes retention or authorizes synchronization.
// Classification order: setting definition, manifest override, entity codec, policy rule, device doc,
// agent table. Anything left over keeps a regex heuristic but is a review flag that --check fails on
// unless it is listed (with a justification) in REVIEWED_HEURISTICS.
import ts from 'typescript';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { files } from './phase31a-inventory.mjs';
const path = 'docs/architecture/data-scope-inventory.json';
const norm = f => f.replaceAll('\\', '/');

// Heuristic sites that were reviewed by hand. Key: `<source>::<namespace>::<key>` or `<source>::*` (whole file).
const REVIEWED_HEURISTICS = {
  'apps/desktop/crash-detection.ts::*': 'Crash-state marker file (clean-exit flag); device-local, non-sensitive.',
  'apps/desktop/fs-job-convert.ts::*': 'Tool output staged into a user-chosen destination, not app state.',
  'apps/desktop/fs-job-hash.ts::*': 'Snapshot body/header files; headers mirrored to snapshot_headers, bodies stay on disk, local-only.',
  'apps/desktop/fs-job-search.ts::*': 'Tool output staged into a user-chosen destination, not app state.',
  'apps/desktop/fs-job-split.ts::*': 'Tool output staged into a user-chosen destination, not app state.',
  'apps/desktop/fs-mutation.ts::*': 'Staged user-file mutation under the destructive-action contract; not app state.',
  'apps/desktop/fs-snapshots.ts::*': 'Filesystem snapshot bodies/headers on disk; local-only, bodies never leave the device.',
  'apps/desktop/fs-watch-service.ts::*': 'Atomic temp-file write of watch timeline/content; local-only.',
  'apps/desktop/mutation-core.ts::*': 'Mutation journal entry temp file; local-only undo data.',
  'apps/desktop/powershell-workbench.ts::*': 'Versioned command-catalog cache and legacy history file; local-only.',
  'apps/desktop/sys-mutation.ts::*': 'System-mutation backup content; local-only undo data.',
  'apps/desktop/sys-snapshots.ts::*': 'System snapshot files; local-only, unredacted system values.',
  'apps/web/src/app/core/appearance/appearance-prepaint-mirror.ts::*': 'Prepaint mirror of the appearance entity so the first frame matches the theme; derived copy, not an owner.',
  'apps/web/src/app/core/appearance/appearance.service.ts::*': 'Signal .set on the appearance state; persisted via the settings:appearance setting definition.',
  'apps/web/src/app/core/backup/dude-bundle.service.ts::*': 'User-initiated bundle import writing per-tool keys through the persistence backend; scope resolved per key on read.',
  'apps/web/src/app/core/device/device-identity.service.ts::*': 'Web installation id record: random opaque id, device identity on the web host.',
  'apps/web/src/app/core/history/history-db.ts::*': 'Local History IndexedDB adapter (web); local-only payloads.',
  'apps/web/src/app/core/history/history-repository.ts::*': 'Local History repository (web IndexedDB / desktop SQLite); local-only payloads.',
  'apps/web/src/app/core/native-recents/native-recents.service.ts::*': 'Signal .set on the native-recents state; entity-codec classified at the signal declaration (device).',
  'apps/web/src/app/core/offline/cache-inspector.service.ts::*': 'Signal .set of storage estimate; no persistence.',
  'apps/web/src/app/core/persistence/device-store/renderer-legacy-import.ts::*': 'One-time legacy renderer key import marker; local migration bookkeeping.',
  'apps/web/src/app/core/persistence/entities/entity-legacy-import.ts::*': 'One-time entity legacy import marker; local migration bookkeeping.',
  'apps/web/src/app/core/persistence/persistence.service.ts::*': 'Generic backend writes behind PersistenceService; scope resolved per key by resolveKvScope.',
  'apps/web/src/app/core/persistence/secrets.service.ts::*': 'Secrets bridge call; values go to the Device Store secret table by reference, never exported.',
  'apps/web/src/app/core/persistence/storage-backend.ts::*': 'Generic storage backend dispatch; scope resolved per key by resolveKvScope.',
  'apps/web/src/app/core/persistence/window-storage-backend.ts::*': 'Raw window storage backend adapter; scope resolved per key by resolveKvScope.',
  'apps/web/src/app/core/platform/network-run-repository.ts::*': 'Network run history repository (web IndexedDB / desktop SQLite); local-only.',
  'apps/web/src/app/core/storage/indexed-db.ts::*': 'Raw IndexedDB opener used by local-only history stores.',
  'apps/web/src/app/core/storage/legacy-indexeddb-import.ts::*': 'Read-only raw IndexedDB reader for the one-time legacy import.',
  'apps/web/src/app/core/text-file-input/imported-file-flags.ts::*': 'sessionStorage one-shot notice flags for imported files; session-only, non-sensitive.',
  'apps/web/src/app/core/workspace/scratchpad.service.ts::*': 'Signal .set on scratchpad state; entity-codec classified at the signal declaration (workspace).',
  'apps/web/src/app/core/workspace/workspace-storage-bridge.ts::*': 'Workspace override write via resolveBackend; scope resolved per key by resolveKvScope.',
  'apps/web/src/app/shell/onboarding/onboarding.ts::*': 'Writes the AI API key through the secrets bridge (secret ref, device); no plaintext storage.',
  'apps/web/src/app/shell/settings/sections/ai-provider-settings.ts::*': 'Writes the AI API key through the secrets bridge (secret ref, device); no plaintext storage.',
};

// ---- declarations -------------------------------------------------------------------------
// Normalize line endings so `operation` snippets are identical on a CRLF (Windows autocrlf) and an LF checkout.
const parse = f => ts.createSourceFile(f, readFileSync(f, 'utf8').replaceAll('\r\n', '\n'), ts.ScriptTarget.Latest, true);
const str = n => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : undefined;
const prop = (o, name) => o.properties.find(p => ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text === name);

const settingDefinitions = new Map();
{
  const sf = parse('packages/persistence/src/settings/core-setting-definitions.ts');
  (function v(n) {
    if (ts.isObjectLiteralExpression(n) && prop(n, 'namespace') && prop(n, 'name') && prop(n, 'scope')) {
      const g = k => str(prop(n, k)?.initializer);
      settingDefinitions.set(`${g('namespace')}::${g('name')}`, { scope: g('scope'), sensitivity: g('sensitivity') ?? 'sensitive' });
    }
    ts.forEachChild(n, v);
  })(sf);
}
const manifestScopes = new Map();
for (const f of files('packages/tool-registry/src/tools').filter(f => f.endsWith('.manifest.ts'))) {
  const sf = parse(f);
  (function v(n) {
    if (ts.isObjectLiteralExpression(n)) {
      const id = str(prop(n, 'id')?.initializer), ss = prop(n, 'settingScopes')?.initializer;
      if (id && ss && ts.isObjectLiteralExpression(ss)) for (const p of ss.properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        const scope = str(prop(p.initializer, 'scope')?.initializer), key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
        if (scope && key) manifestScopes.set(`${id}::${key}`, { scope, file: norm(f) });
      }
    }
    ts.forEachChild(n, v);
  })(sf);
}
const codecs = new Map(); // identifier -> {entityType, scope}
for (const f of files('packages/persistence/src/codecs').filter(f => f.endsWith('.codec.ts'))) {
  const sf = parse(f);
  (function v(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      (function find(m) {
        if (ts.isObjectLiteralExpression(m) && prop(m, 'entityType') && prop(m, 'scope') && !codecs.has(n.name.text))
          codecs.set(n.name.text, { entityType: str(prop(m, 'entityType').initializer), scope: str(prop(m, 'scope').initializer) });
        ts.forEachChild(m, find);
      })(n.initializer);
    }
    ts.forEachChild(n, v);
  })(sf);
}
const policyScope = policy => policy === 'local' ? 'environment' : policy === 'secure-local' ? 'device' : 'local-only';

// ---- heuristics (review flags only) -------------------------------------------------------
function heuristic({ namespace, key, policy, file, receiver }) {
  const local = namespace && /__(usage|recents|history|scratch|recovery|native)/.test(namespace);
  const workbench = namespace && /__(projects|pipelines|workspace|templates)/.test(namespace);
  const secret = /secret|credential|password|privateKey|apiKey|llmKey/i.test(key ?? '') || /secrets|secure-local/.test(file) || /secrets/.test(receiver);
  const input = policy === 'none' || policy === 'session' || /input|source|payload|body|token|headers|content|notes|customCss|script/i.test(key ?? '');
  const device = /rootPath|terminal|executable|socket|windowBounds|directory|folder|repositoryRoot/i.test(key ?? '');
  const safePreference = /^(mode|indent|algorithm|unit|flags|format|theme|appearance|density|accent|palette|font|wrap|sort|encoding|delimiter|precision|language|tabSize)$/i.test(key ?? '');
  const favorites = namespace === '__favorites__';
  const scope = secret || input || local ? 'local-only' : device ? 'device' : favorites || safePreference ? 'environment' : workbench ? 'workspace' : 'local-only';
  return { scope, secret, safePreference, favorites };
}

// ---- site discovery -----------------------------------------------------------------------
const entries = [], reviewFlags = [];
const storageMethods = new Set(['setItem', 'writeFile', 'writeFileSync', 'put', 'add', 'set', 'open', 'openDatabase']);
const importedSettings = Object.fromEntries([...readFileSync('packages/tool-engine/src/core/persistence/app-settings.ts', 'utf8').matchAll(/export const (\w+) = '([^']+)'/g)].map(m => [m[1], m[2]]));
const scanFiles = [...files('apps/web/src/app'), ...files('apps/desktop'), ...files('apps/device-agent'), ...(existsSync('apps/hub/src') ? files('apps/hub') : [])]
  .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !/[\\/](testing|node_modules|dist)[\\/]/.test(f) && !f.endsWith('.d.ts'));
for (const file of scanFiles) {
  const source = norm(file), sf = parse(file);
  const constants = new Map();
  (function c(n) { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && str(n.initializer) !== undefined) constants.set(n.name.text, str(n.initializer)); ts.forEachChild(n, c); })(sf);
  const resolve = a => a && (str(a) ?? (ts.isIdentifier(a) ? constants.get(a.text) ?? importedSettings[a.text] : undefined));
  const base = n => ({ source, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, operation: n.getText(sf) });
  const entryConsent = scope => scope === 'environment' || scope === 'workspace' ? 'per category after enrollment and first-sync confirmation (see entity inventory)' : 'not granted';
  const push = (n, e) => entries.push({ ...base(n), ...e, syncConsent: entryConsent(e.scope) });
  const flag = (n, { namespace, key, policy, receiver, common }) => {
    const h = heuristic({ namespace, key, policy, file, receiver });
    push(n, { ...common, scope: h.scope, sensitivity: h.secret ? 'secret' : h.safePreference || h.favorites ? 'non-sensitive' : 'sensitive', classificationBasis: 'regex-heuristic (review flag)' });
    const reviewKey = [`${source}::${namespace ?? ''}::${key ?? ''}`, `${source}::*`].find(k => k in REVIEWED_HEURISTICS);
    reviewFlags.push({ source, line: base(n).line, namespace: namespace ?? null, key: key ?? null, heuristicScope: h.scope, reviewed: reviewKey ? REVIEWED_HEURISTICS[reviewKey] : null });
  };
  const referencedCodec = call => { let found; (function w(m) { if (!found && ts.isIdentifier(m) && codecs.has(m.text)) found = m.text; ts.forEachChild(m, w); })(call); return found; };
  (function visit(n) {
    if (ts.isCallExpression(n)) {
      const args = n.arguments;
      if (ts.isIdentifier(n.expression) && (n.expression.text === 'loadDoc' || n.expression.text === 'saveDoc')) {
        const name = resolve(args[0]) ?? null;
        push(n, { namespace: null, key: name, storage: 'Device Store device_docs', storageLocation: `device_docs row ${name ?? '<dynamic name>'}`, retention: 'until changed/reset', scope: 'device', sensitivity: 'sensitive', classificationBasis: 'device-doc' });
      } else if (ts.isPropertyAccessExpression(n.expression)) {
        const method = n.expression.name.text, receiver = n.expression.expression.getText(sf);
        const sArg = i => resolve(args[i]);
        const policy = sArg(2);
        const signal = method === 'signal' && ['none', 'session', 'local', 'user-choice', 'secure-local'].includes(policy);
        const codecId = (method === 'collection' || signal) ? referencedCodec(n) : undefined;
        if (method === 'collection' && codecId && args[1] && ts.isObjectLiteralExpression(args[1]) || method === 'collection' && codecId && args[0] && ts.isObjectLiteralExpression(args[0])) {
          const codec = codecs.get(codecId), cfg = [...args].find(a => ts.isObjectLiteralExpression(a) && prop(a, 'namespace')), ns = resolve(prop(cfg, 'namespace')?.initializer), key = resolve(prop(cfg, 'key')?.initializer);
          push(n, { namespace: ns ?? null, key: key ?? null, storage: 'EntityStore', storageLocation: `Device Store records entity_type=${codec.entityType} (legacy mirror ${ns}:${key})`, retention: 'until removed/reset', scope: codec.scope, sensitivity: codec.scope === 'local-only' ? 'sensitive' : 'non-sensitive', entityType: codec.entityType, classificationBasis: 'entity-codec' });
        } else if (signal && codecId && !settingDefinitions.has(`${sArg(0)}::${sArg(1)}`) && !manifestScopes.has(`${sArg(0)}::${sArg(1)}`)) {
          const codec = codecs.get(codecId), ns = sArg(0), key = sArg(1);
          push(n, { namespace: ns ?? null, key: key ?? null, storage: 'PersistenceService', storageLocation: `Device Store records entity_type=${codec.entityType} (legacy mirror ${ns}:${key})`, retention: policy, scope: codec.scope, sensitivity: codec.scope === 'local-only' ? 'sensitive' : 'non-sensitive', entityType: codec.entityType, classificationBasis: 'entity-codec' });
        } else if (signal) {
          const ns = sArg(0), key = sArg(1);
          const loc = policy === 'none' ? 'memory only' : `${policy === 'session' ? 'sessionStorage' : policy === 'user-choice' ? 'sessionStorage; Device Store/localStorage only after existing retention consent' : 'Device Store kv (browser localStorage mirror)'}: dude:v1:${ns ?? '<dynamic namespace>'}:${key ?? '<dynamic key>'}`;
          const common = { namespace: ns ?? null, key: key ?? null, storage: 'PersistenceService', storageLocation: loc, retention: policy };
          const def = settingDefinitions.get(`${ns}::${key}`), man = manifestScopes.get(`${ns}::${key}`);
          if (def) push(n, { ...common, scope: def.scope, sensitivity: def.sensitivity, classificationBasis: 'setting-definition' });
          else if (man) push(n, { ...common, scope: man.scope, sensitivity: 'sensitive', manifest: man.file, classificationBasis: 'manifest-override' });
          else push(n, { ...common, scope: policyScope(policy), sensitivity: policy === 'local' ? 'non-sensitive' : 'sensitive', classificationBasis: 'policy-rule' });
        } else if (storageMethods.has(method) && /Storage|indexedDB|\bfs\b|\bfsp\b|store|journal|database|\bdb\b|secrets|\.local$|\.session$|Backend/i.test(receiver) && (method !== 'open' || /indexedDB/.test(receiver))) {
          flag(n, { namespace: undefined, key: sArg(0), policy: undefined, receiver, common: { namespace: null, key: sArg(0) ?? null, storage: receiver, storageLocation: n.getText(sf), retention: 'owned by the referenced backend; no policy change' } });
        }
      }
    }
    ts.forEachChild(n, visit);
  })(sf);
}
// Device-agent tables (the SQLite schema is the declaration).
const agentTables = {
  meta: ['device', 'identity, device/environment ids and import flags'],
  schema_migrations: ['device', 'migration bookkeeping'],
  kv: ['per-row', 'per-tool key/value; scope per row via resolveKvScope (setting definition, manifest override, policy rule)'],
  records: ['per-row', 'entities; scope per row from the entity codec'],
  outbox: ['device', 'durable local outbox of pending operations; sent only for sync categories with per-category consent after enrollment (Phase 31D); nothing while standalone'],
  history_entries: ['local-only', 'Local History payloads'],
  network_runs: ['local-only', 'network run results and targets'],
  mutation_journal: ['local-only', 'filesystem and system mutation journals'],
  snapshot_headers: ['local-only', 'snapshot metadata'],
  powershell_history: ['local-only', 'PowerShell execution history'],
  device_docs: ['device', 'desktop documents (preferences, window bounds, hotkeys, etc.)'],
  secret_refs: ['device', 'secret references (no values)'],
  secret_values: ['device', 'encrypted secret values; secret sensitivity, never exported'],
  hub_enrollment: ['device', 'device-private Hub enrollment: pins, ids and the DPAPI-wrapped Ed25519 device key; secret sensitivity, never exported or synced, cleared on clone detection and Reset this device'],
  kv_sync: ['device', 'per-key Hub revision and last Hub value (merge base) for synced kv keys; sync bookkeeping, never synced itself'],
  sync_state: ['device', 'single-row sync cursor, floor, pause flag, per-category enablement and first-sync progress; never synced'],
  sync_conflicts: ['device', 'unresolved merge conflicts holding local and remote versions of synced entities until the user resolves them; never synced'],
};
// Hub tables (apps/hub/src/db/migrations): none classified yet; an unknown table throws like device-agent.
const hubTables = {
  meta: ['local-only', 'Hub-private instance bookkeeping (hub_instance_id, schema versions)'],
  schema_migrations: ['local-only', 'migration bookkeeping'],
  environment: ['environment', 'canonical environment identity minted by the Hub'],
  owner: ['environment', 'canonical owner profile (identity, no credentials)'],
  owner_credentials: ['local-only', 'Hub-private Argon2id password verifier; never leaves the Hub'],
  recovery_codes: ['local-only', 'Hub-private recovery code hashes'],
  sessions: ['local-only', 'Hub-private session hashes, IPs and user agents'],
  devices: ['environment', 'canonical device registry'],
  device_keys: ['environment', 'canonical device public keys (no private material)'],
  device_sync_state: ['environment', 'per-device sync cursor and last self-reported queue counts (no content), used for lag and health display'],
  device_tokens: ['local-only', 'Hub-private device token hashes'],
  challenges: ['local-only', 'Hub-private short-lived challenge nonces'],
  pairing_codes: ['local-only', 'Hub-private pairing code hashes'],
  setup_state: ['local-only', 'Hub-private first-run setup token hash'],
  throttle: ['local-only', 'Hub-private authentication throttling counters'],
  audit_events: ['local-only', 'Hub-private audit trail; never carries credentials or payloads'],
  tls_pins: ['local-only', 'Hub-private TLS certificate pin lifecycle'],
  tls_pin_acks: ['local-only', 'Hub-private per-device TLS pin acknowledgements'],
  tls_proxy_pins: ['local-only', 'Hub-private reverse-proxy leaf pin set (active and next)'],
  tls_proxy_pin_acks: ['local-only', 'Hub-private per-device reverse-proxy pin acknowledgements'],
  records: ['environment', 'canonical synchronized records with revision and tombstone'],
  change_feed: ['environment', 'canonical per-environment change feed'],
  applied_ops: ['environment', 'canonical idempotency ledger for applied operations'],
};
const migrationSources = [
  { dir: 'apps/device-agent/src/store/migrations', tables: agentTables, label: 'device-agent', basis: 'agent-table', storage: 'Device Store (node:sqlite)', location: name => `userData/device-store/dude-device.db table ${name}` },
  { dir: 'apps/hub/src/db/migrations', tables: hubTables, label: 'hub', basis: 'hub-table', storage: 'Hub database (node:sqlite)', location: name => `data/dude.db table ${name}` },
];
for (const src of migrationSources) {
  if (!existsSync(src.dir)) continue;
  for (const fileName of readdirSync(src.dir).filter(n => /^\d{4}-.*\.ts$/.test(n)).sort()) {
    const f = src.dir + '/' + fileName, text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/CREATE TABLE (\w+)/g)) {
      const t = src.tables[m[1]]; if (!t) throw Error(`Unclassified ${src.label} table ${m[1]}`);
      entries.push({ source: f, line: text.slice(0, m.index).split('\n').length, operation: `CREATE TABLE ${m[1]}`, namespace: null, key: m[1], storage: src.storage, storageLocation: src.location(m[1]), retention: 'existing per-table policy', scope: t[0], sensitivity: m[1] === 'secret_values' || m[1] === 'hub_enrollment' ? 'secret' : t[0] === 'local-only' ? 'sensitive' : 'non-sensitive', note: t[1], classificationBasis: src.basis, syncConsent: 'not granted' });
    }
  }
}
entries.sort((a, b) => a.source.localeCompare(b.source) || a.operation.localeCompare(b.operation) || a.line - b.line);
reviewFlags.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line);

const entityFile = 'docs/architecture/data-scope-entities.json';
const entities = JSON.parse(readFileSync(entityFile, 'utf8'));
for (const entity of entities) {
  if (!existsSync(entity.source)) throw Error('Missing scope evidence ' + entity.source);
  for (const scope of Object.values(entity.fieldScopes ?? { record: entity.scope })) if (!['environment', 'workspace', 'device', 'local-only'].includes(scope)) throw Error('Invalid entity scope ' + entity.id);
}
const basisCounts = {};
for (const e of entries) basisCounts[e.classificationBasis] = (basisCounts[e.classificationBasis] ?? 0) + 1;
const output = JSON.stringify({
  schemaVersion: 3,
  purpose: 'Checked Phase 31B declarations; classification follows setting definitions, manifest overrides, entity codecs, the policy rule, device docs and agent tables. Regex heuristics are review flags only and must be listed in REVIEWED_HEURISTICS. Scope alone grants no synchronization consent: consent is per category after enrollment and first-sync confirmation.',
  entityInventory: entityFile,
  identityAndSchemaGaps: [
    'Stable entity ids, device id, environment id and schema versions now exist on Device Store records and outbox operations (31B)',
    'Hub revisions, replay and conflict semantics exist for enrolled desktops since Phase 31D (per-entity policies in SYNC_POLICIES)',
    'The first-sync preview (what would leave the device) exists since Phase 31D; consent is per category',
    'Mixed records need field-level redaction before any future sync opt-in',
    'Retention consent is independent of synchronization consent; sync consent is per category and only environment or workspace scoped data can be consented (Phase 31D)',
  ],
  classificationCounts: basisCounts,
  reviewFlags,
  entries,
}, null, 2) + '\n';
const unreviewed = reviewFlags.filter(f => !f.reviewed);
if (process.argv.includes('--check')) {
  if (unreviewed.length) throw Error('Undeclared storage sites need a declaration or a REVIEWED_HEURISTICS entry:\n' + unreviewed.map(f => `  ${f.source}:${f.line} ${f.namespace ?? ''}:${f.key ?? ''}`).join('\n'));
  if (readFileSync(path, 'utf8') !== output) throw Error('Data scope inventory is stale: run node scripts/data-scope-inventory.mjs');
} else writeFileSync(path, output);
console.log(`${entries.length} storage declarations/sites classified (${JSON.stringify(basisCounts)}); ${reviewFlags.length} review flags, ${unreviewed.length} unreviewed; consent is per sync category (Phase 31D); device and local-only data are never sent.`);
