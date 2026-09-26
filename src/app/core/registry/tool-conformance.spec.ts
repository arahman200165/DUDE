import { existsSync } from 'node:fs';
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
