import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { DudeDataType } from '../../shared/models/tool-io.model';
import { PersistencePolicy } from '../../shared/models/persistence-policy.model';
import { ConsequenceClass } from '../../shared/models/tool-definition.model';

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
];

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

      it('declares non-empty desktopCapabilities strings, when present', () => {
        for (const capability of definition.desktopCapabilities ?? []) {
          expect(capability.trim().length, `${definition.id} declares a blank desktopCapabilities entry`).toBeGreaterThan(0);
        }
      });

      // Universal File Input (core/text-file-input/AGENTS.md): a wrong key would make every
      // dashboard drop / Smart Paste prefill silently write somewhere the tool never reads.
      it('declares a fileInput whose key really is a persisted input of the tool, when present', () => {
        const fileInput = definition.fileInput;
        if (!fileInput) return;
        expect(fileInput.extensions.length, `${definition.id} fileInput declares no extensions`).toBeGreaterThan(0);
        for (const extension of fileInput.extensions) expect(extension).toMatch(/^\.[a-z0-9]+$/);
        const dir = resolve(process.cwd(), 'src/app/tools', definition.id);
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
        const templatePath = resolve(process.cwd(), 'src/app/tools', definition.id, `${definition.id}.html`);
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
        const manifestPath = resolve(process.cwd(), 'src/app/tools', definition.id, `${definition.id}.manifest.ts`);
        expect(existsSync(manifestPath), `Expected manifest file not found: ${manifestPath}`).toBe(true);
      });
    });
  }
});
