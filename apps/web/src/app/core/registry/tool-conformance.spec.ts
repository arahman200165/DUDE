import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { TOOL_CATEGORIES } from "@dude/shared-types/shared/models/tool-category.model";
import { DudeDataType } from "@dude/shared-types/shared/models/tool-io.model";
import { PersistencePolicy } from "@dude/shared-types/shared/models/persistence-policy.model";
import { ConsequenceClass } from '../../shared/models/tool-definition.model';
import { PLATFORM_CAPABILITY_IDS, RUNTIME_IDS, RuntimeId } from "@dude/shared-types/shared/models/tool-capability.model";
import { isDataScope } from '@dude/domain';
import { PLATFORM_CAPABILITIES } from "@dude/contracts/core/platform/capability-catalog";

// One authoritative structural-validation pass over the real registry (DUDE_PRD.md §21 Phase
// 22 Item 3), consolidating what tool-registry.service.spec.ts's validateDefinitions (synthetic
// fixtures only) and tool-count.spec.ts's I/O check partially covered. Metadata-only by design
// (Phase 22 Item 11's confirmed scope) — no TestBed, no component mounting.

const VALID_IO_TYPES: readonly DudeDataType[] = ['text', 'json', 'bytes', 'file', 'table', 'url', 'http-response'];
const VALID_PERSISTENCE_POLICIES: readonly PersistencePolicy[] = [
  'none',
  'session',
  'local',
  'user-choice',
  'secure-local',
];
const VALID_STATUSES = ['experimental', 'stable', 'verified'];
const VALID_CONSEQUENCE_CLASSES: readonly ConsequenceClass[] = [
  'crypto',
  'authentication',
  'code-execution',
  'filesystem-write',
  'process-management',
  'registry',
  'network-scanning',
  'database-write',
  'secret-management',
  'remote-write',
  'system-config',
];

// Web Capability Matrix (Phase 26 Item 6): a runtime is "used" when non-spec source references
// its asset path/package in code (string literal or import), not merely mentions it in a comment.
const RUNTIME_SOURCE_PATTERNS: Readonly<Record<RuntimeId, RegExp>> = {
  pyodide: /['"`]assets\/vendor\/pyodide/,
  sqljs: /from ['"]sql\.js['"]/,
  xmllint: /from ['"]xmllint-wasm['"]/,
  ejs: /['"`]assets\/vendor\/ejs\.min\.js/,
};

function toolSource(id: string): string {
  const dirs = ['apps/web/src/app/tools', 'packages/tool-engine/src/tools'].map(root => resolve(process.cwd(), root, id)).filter(existsSync);
  return dirs.flatMap(dir => readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .map((file) => readFileSync(resolve(dir, file), 'utf8')))
    .join('\n');
}

// Per-key settingScopes (Phase 31B): main validates every kv key against this pattern, so a manifest
// key that can't pass would be refused at runtime, and a key no signal ever uses is dead metadata.
const SETTING_KEY = /^[A-Za-z0-9_.:-]{1,128}$/;
const VALID_SENSITIVITIES = ['non-sensitive', 'sensitive', 'secret'];

function listSources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [readFileSync(path, 'utf8')] : [];
  });
}

/** Problems with a `settingScopes` map; `sources` are the tool's non-spec .ts files. Empty means valid. */
export function checkSettingScopes(scopes: Record<string, unknown>, sources: readonly string[]): string[] {
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(scopes)) {
    if (!SETTING_KEY.test(key)) problems.push(`key "${key}" does not match ${SETTING_KEY}`);
    const value = entry as { scope?: unknown; sensitivity?: unknown } | null;
    if (!value || !isDataScope(value.scope)) problems.push(`key "${key}" has an invalid scope`);
    if (value && value.sensitivity !== undefined && !VALID_SENSITIVITIES.includes(value.sensitivity as string)) problems.push(`key "${key}" has an invalid sensitivity`);
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const used = new RegExp(`['"]${escaped}['"]\\s*,\\s*['"](?:local|session|secure-local|user-choice|none)['"]`);
    if (!sources.some((source) => used.test(source))) problems.push(`key "${key}" is not a persistence.signal key in the tool's sources`);
  }
  return problems;
}

describe('checkSettingScopes', () => {
  const source = "readonly indent = this.persistence.signal<number>('json', 'indent', 'local', 2);";
  it('accepts a real key with a valid scope and sensitivity', () => {
    expect(checkSettingScopes({ indent: { scope: 'environment', sensitivity: 'non-sensitive' } }, [source])).toEqual([]);
  });
  it('rejects a bad key, scope, sensitivity and an unused key', () => {
    expect(checkSettingScopes({ 'bad key!': { scope: 'nope', sensitivity: 'x' } }, [source])).toHaveLength(4);
  });
});

describe('Tool conformance harness', () => {
  it('has at least one registered tool', () => {
    expect(TOOL_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('has no duplicate ids across the real registry', () => {
    const ids = TOOL_DEFINITIONS.map((t) => t.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates, `Duplicate tool ids: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('has no duplicate routes across the real registry', () => {
    const routes = TOOL_DEFINITIONS.map((t) => t.route);
    const duplicates = routes.filter((route, i) => routes.indexOf(route) !== i);
    expect(duplicates, `Duplicate tool routes: ${duplicates.join(', ')}`).toEqual([]);
  });

  for (const definition of TOOL_DEFINITIONS) {
    describe(definition.id, () => {
      it('declares a valid category', () => {
        expect(TOOL_CATEGORIES, `${definition.id} has unknown category "${definition.category}"`).toContain(
          definition.category,
        );
      });

      it('declares a non-empty io.accepts/io.produces drawn from DudeDataType', () => {
        expect(definition.io.accepts.length, `${definition.id} is missing io.accepts`).toBeGreaterThan(0);
        expect(definition.io.produces.length, `${definition.id} is missing io.produces`).toBeGreaterThan(0);
        for (const type of [...definition.io.accepts, ...definition.io.produces]) {
          expect(VALID_IO_TYPES, `${definition.id} declares unknown io type "${type}"`).toContain(type);
        }
      });

      it('declares valid persistence policies, when present', () => {
        if (definition.persistence?.input) {
          expect(VALID_PERSISTENCE_POLICIES).toContain(definition.persistence.input);
        }
        if (definition.persistence?.preferences) {
          expect(VALID_PERSISTENCE_POLICIES).toContain(definition.persistence.preferences);
        }
      });

      it('declares a valid status', () => {
        expect(definition.status, `${definition.id} is missing a status`).toBeDefined();
        expect(VALID_STATUSES).toContain(definition.status);
      });

      it('declares a verification summary when status is "verified"', () => {
        if (definition.status === 'verified') {
          expect(
            definition.verification?.summary,
            `${definition.id} is "verified" but has no verification.summary`,
          ).toBeTruthy();
        }
      });

      it('declares valid consequence classes, when present', () => {
        for (const consequenceClass of definition.consequenceClass ?? []) {
          expect(
            VALID_CONSEQUENCE_CLASSES,
            `${definition.id} declares unknown consequence class "${consequenceClass}"`,
          ).toContain(consequenceClass);
        }
      });

      it('declares well-formed, non-duplicate capabilities from the closed vocabulary, when present', () => {
        const seen = new Set<string>();
        for (const capability of definition.capabilities ?? []) {
          const key = capability.kind === 'platform' ? capability.id : `runtime:${capability.runtime}`;
          expect(seen.has(key), `${definition.id} declares capability "${key}" twice`).toBe(false);
          seen.add(key);
          if (capability.kind === 'platform') {
            expect(PLATFORM_CAPABILITY_IDS, `${definition.id} declares unknown capability "${capability.id}"`).toContain(capability.id);
            expect(['fallback', 'unavailable']).toContain(capability.web);
            expect(capability.note.trim().length, `${definition.id} capability "${capability.id}" has a blank note`).toBeGreaterThan(0);
          } else {
            expect(RUNTIME_IDS, `${definition.id} declares unknown runtime "${capability.runtime}"`).toContain(capability.runtime);
          }
        }
      });

      // Desktop-Only Feature Badges (Phase 26 Item 7): a feature that's absent on the web must be
      // visibly badged there, not silently hidden. Every `web: 'unavailable'` capability renders an
      // <app-desktop-only-control capability="…"> stand-in in the tool's template.
      it("renders a desktop-only stand-in for each capability that's unavailable on the web", () => {
        const unavailable = (definition.capabilities ?? []).flatMap((c) => (c.kind === 'platform' && c.web === 'unavailable' ? [c.id] : []));
        if (!unavailable.length) return;
        const template = readFileSync(resolve(process.cwd(), 'apps/web/src/app/tools', definition.id, `${definition.id}.html`), 'utf8');
        for (const id of unavailable) {
          expect(template, `${definition.id} declares '${id}' unavailable on web but never renders <app-desktop-only-control capability="${id}">`).toMatch(
            new RegExp(`<app-desktop-only-control[^>]*capability="${id}"`),
          );
        }
      });

      // The matrix is only trustworthy if it can't drift from the code: importing a native service
      // or referencing a vendored runtime without declaring it (or vice versa) fails here.
      it('declares exactly the platform capabilities and runtimes its source actually uses', () => {
        const source = toolSource(definition.id);
        const declaredPlatform = new Set(
          (definition.capabilities ?? []).flatMap((c) => (c.kind === 'platform' ? [c.id] : [])),
        );
        for (const id of PLATFORM_CAPABILITY_IDS) {
          const uses = id === 'native-network'
            // The Certificate Watch List drives the native network bridge directly through
            // CertificateWatchService (background checks), rather than the shared NetworkWorkbench.
            ? source.includes('NetworkWorkbench') || source.includes('CertificateWatchService')
            : [PLATFORM_CAPABILITIES[id].service, ...(PLATFORM_CAPABILITIES[id].alsoVia ?? [])].some((name) => new RegExp(`import \\{[^}]*\\b${name}\\b`).test(source));
          expect(declaredPlatform.has(id), `${definition.id}: imports ${PLATFORM_CAPABILITIES[id].service} ⇔ declares '${id}'`).toBe(uses);
        }
        const declaredRuntimes = new Set(
          (definition.capabilities ?? []).flatMap((c) => (c.kind === 'runtime' ? [c.runtime] : [])),
        );
        for (const runtime of RUNTIME_IDS) {
          const uses = RUNTIME_SOURCE_PATTERNS[runtime].test(source);
          expect(declaredRuntimes.has(runtime), `${definition.id}: references the ${runtime} runtime ⇔ declares it`).toBe(uses);
        }
      });

      // Universal File Input (core/text-file-input/AGENTS.md): a wrong key would make every
      // dashboard drop / Smart Paste prefill silently write somewhere the tool never reads.
      it('declares a fileInput whose key really is a persisted input of the tool, when present', () => {
        const fileInput = definition.fileInput;
        if (!fileInput) return;
        expect(fileInput.extensions.length, `${definition.id} fileInput declares no extensions`).toBeGreaterThan(0);
        for (const extension of fileInput.extensions) expect(extension).toMatch(/^\.[a-z0-9]+$/);
        const dir = resolve(process.cwd(), 'apps/web/src/app/tools', definition.id);
        const component = readFileSync(resolve(dir, `${definition.id}.ts`), 'utf8');
        const policy = fileInput.policy ?? 'session';
        expect(
          new RegExp(`'${fileInput.key}',\\s*'${policy}'`).test(component),
          `${definition.id} fileInput.key "${fileInput.key}" isn't a '${policy}' persistence.signal key in ${definition.id}.ts`,
        ).toBe(true);
        const template = readFileSync(resolve(dir, `${definition.id}.html`), 'utf8');
        expect(template, `${definition.id} declares fileInput but never renders <app-open-text-file>`).toContain('<app-open-text-file');
        expect(definition.io.accepts, `${definition.id} loads files (fileInput) so io.accepts needs 'file'`).toContain('file');
      });

      it("declares 'file' in io.produces when it renders a Save button (ADDING_A_TOOL.md step 7)", () => {
        const templatePath = resolve(process.cwd(), 'apps/web/src/app/tools', definition.id, `${definition.id}.html`);
        if (!existsSync(templatePath) || !readFileSync(templatePath, 'utf8').includes('<app-save-text-file')) return;
        expect(definition.io.produces).toContain('file');
      });

      // Settings extension point (shell/settings/): a contributed section renders from the registry
      // alone, so a malformed declaration would surface as a broken Settings page, not a type error.
      it('declares a well-formed settingsSection, when present', () => {
        const section = definition.settingsSection;
        if (!section) return;
        expect(section.title.trim().length, `${definition.id} settingsSection has a blank title`).toBeGreaterThan(0);
        expect(typeof section.load, `${definition.id} settingsSection.load must be a lazy function`).toBe('function');
        const keys = (section.workspaceOverridable ?? []).map((preference) => preference.key);
        expect(new Set(keys).size, `${definition.id} declares duplicate workspaceOverridable keys`).toBe(keys.length);
        for (const preference of section.workspaceOverridable ?? []) {
          expect(preference.label.trim().length, `${definition.id} workspaceOverridable "${preference.key}" has a blank label`).toBeGreaterThan(0);
        }
      });

      it('declares settingScopes whose keys are valid, scoped and really persisted by the tool, when present', () => {
        if (!definition.settingScopes) return;
        const sources = listSources(resolve(process.cwd(), 'apps/web/src/app/tools', definition.id));
        expect(checkSettingScopes(definition.settingScopes, sources), `${definition.id} settingScopes`).toEqual([]);
      });

      it('declares storageMigrations that never move a key onto itself, when present', () => {
        for (const migration of definition.storageMigrations ?? []) {
          expect(
            migration.fromNamespace === definition.id && migration.fromKey === migration.toKey,
            `${definition.id} declares a storage migration from its own "${migration.toKey}" key onto itself`,
          ).toBe(false);
        }
      });

      it('has a lazy load() function, never eagerly resolved', () => {
        expect(typeof definition.load).toBe('function');
      });

      it('has a backing <id>.manifest.ts file on disk', () => {
        const manifestPath = resolve(process.cwd(), 'packages/tool-registry/src/tools', definition.id, `${definition.id}.manifest.ts`);
        expect(existsSync(manifestPath), `Expected manifest file not found: ${manifestPath}`).toBe(true);
      });
    });
  }
});
