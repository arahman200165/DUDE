import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { migrateFavoritesStore } from '@dude/domain/core/favorites/favorites.model';
import { migratePipelineStore, migrateUserScriptStore } from '@dude/domain/core/pipeline/pipeline.model';
import { migrateProjectStore } from '@dude/domain/core/project/project.model';
import { migrateWorkspaceTemplateStore } from '@dude/domain/core/workspace/workspace-template.model';
import { migrateWorkspaceLayout } from '@dude/domain/core/workspace/workspace.model';
import { migrateScratchpadStore } from '@dude/domain/core/workspace/scratchpad.model';
import { migrateUsageStore } from '@dude/domain/core/usage/usage.model';
import { migrateNativeRecentsStore } from '@dude/domain/core/native-recents/native-recent.model';
import { migrateHistoryEntry } from '@dude/domain/core/history/history.model';
import { migrateHomeLayoutStore } from '@dude/domain/core/home-layout/home-layout-store.model';
import type { KindCatalog } from '@dude/domain/core/home-layout/home-layout-store.model';
import { sanitizeAppearance, DEFAULT_APPEARANCE } from '@dude/domain/core/appearance/appearance.model';
import {
  ENTITY_CODECS, JOURNALED_ENTITY_TYPES, isKnownEntityType, favoriteCodec, favoritesToItems, itemsToFavorites,
  pipelineCodec, userScriptCodec, projectCodec, workspaceTemplateCodec, appearanceCodec, homeLayoutCodec, usageCodec,
  workspaceLayoutCodec, scratchpadCodec, nativeRecentsCodec, historyEntryCodec, isNewerHomeLayoutDocument,
  decodeHomeLayoutReadOnly, type EntityCodec, type HomeLayoutCodecContext,
} from './index.js';

const T = '2026-01-01T00:00:00.000Z';
const tree = {
  kind: 'split', nodeId: 's', ratio: 0.4,
  a: { kind: 'leaf', nodeId: 'l1', toolId: 'json' },
  b: { kind: 'leaf', nodeId: 'l2', toolId: 'base64' },
} as const;

/** Round trip a valid item through encode -> JSON -> decode. */
function roundTrip<T, C>(codec: EntityCodec<T, C>, item: T, ctx: C): T | null {
  return codec.decode(JSON.parse(JSON.stringify(codec.encode(item))), ctx);
}

const GARBAGE: unknown[] = [null, undefined, 0, 'x', true, [], [1, 2], {}, { id: 5 }, { schemaVersion: 'one' }, () => 1];

describe('registry', () => {
  it('knows every entity type and journals the planned set', () => {
    expect(Object.keys(ENTITY_CODECS).sort()).toEqual(
      ['appearance', 'favorite', 'history-entry', 'home-layout', 'native-recents', 'pipeline', 'project', 'scratchpad', 'usage', 'user-script', 'workspace-layout', 'workspace-template'],
    );
    expect([...JOURNALED_ENTITY_TYPES].sort()).toEqual(
      ['appearance', 'favorite', 'home-layout', 'pipeline', 'project', 'usage', 'user-script', 'workspace-template'],
    );
    expect(isKnownEntityType('favorite')).toBe(true);
    expect(isKnownEntityType('toString')).toBe(false);
    expect(isKnownEntityType('nope')).toBe(false);
  });

  it('declares scopes, sensitivity and versions', () => {
    expect(usageCodec.schemaVersion).toBe(2);
    expect(nativeRecentsCodec.scope).toBe('device');
    expect(historyEntryCodec.scope).toBe('local-only');
    expect(favoriteCodec.scope).toBe('environment');
    expect(pipelineCodec.sensitivity).toBe('sensitive');
    expect(workspaceLayoutCodec.journaled).toBe(false);
    for (const codec of Object.values(ENTITY_CODECS)) expect(codec.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it('never throws on garbage for any codec', () => {
    const ctx: HomeLayoutCodecContext = { catalog: { resolve: () => undefined }, defaults: { instances: [], wide: [], narrow: [] } };
    for (const codec of Object.values(ENTITY_CODECS)) {
      for (const g of GARBAGE) expect(() => codec.decode(g, ctx)).not.toThrow();
    }
  });
});

describe('favorites', () => {
  const store = { schemaVersion: 1 as const, toolIds: ['json', 'base64'], pipelineIds: ['p1'] };

  it('matches migrateFavoritesStore and round-trips through helpers', () => {
    const migrated = migrateFavoritesStore(store);
    const items = favoritesToItems(migrated);
    expect(items.map((i) => i.id)).toEqual(['tool:json', 'tool:base64', 'pipeline:p1']);
    for (const item of items) expect(roundTrip(favoriteCodec, item, undefined)).toEqual(item);
    expect(itemsToFavorites(items)).toEqual(migrated);
    expect(itemsToFavorites([...items].reverse())).toEqual(migrated);
  });

  it('drops duplicates and non-string ids; garbage items decode to null', () => {
    expect(favoritesToItems({ toolIds: ['a', 'a', '' as string, 5 as unknown as string], pipelineIds: ['a'] }).map((i) => i.id)).toEqual(['tool:a', 'pipeline:a']);
    expect(favoriteCodec.decode({ id: 'tool:x', kind: 'tool', targetId: 'y', order: 0 })).toBeNull();
    expect(favoriteCodec.decode({ id: 'tool:x', kind: 'weird', targetId: 'x', order: 0 })).toBeNull();
    expect(favoriteCodec.decode({ id: 'tool:x', kind: 'tool', targetId: 'x', order: 'a' })).toBeNull();
    expect(favoriteCodec.decode({ id: 'tool:x', kind: 'tool', targetId: 'x', order: 2, pinnedAt: T, junk: 1 })).toEqual({ id: 'tool:x', kind: 'tool', targetId: 'x', order: 2, pinnedAt: T });
  });

  it('property: helpers round-trip arbitrary id sets', () => {
    const ids = fc.uniqueArray(fc.stringMatching(/^[a-z0-9-]{1,12}$/), { maxLength: 8 });
    fc.assert(fc.property(ids, ids, (toolIds, pipelineIds) => {
      const back = itemsToFavorites(favoritesToItems({ toolIds, pipelineIds }).map((i) => favoriteCodec.decode(favoriteCodec.encode(i))!));
      expect(back).toEqual({ schemaVersion: 1, toolIds, pipelineIds });
    }));
  });
});

describe('pipelines and user scripts', () => {
  const pipeline = {
    schemaVersion: 1 as const, id: 'p1', name: 'Clean', description: 'd', createdAt: T, updatedAt: T, lastRunAt: T, lastRunStatus: 'succeeded' as const,
    steps: [{ kind: 'tool' as const, stepId: 's1', toolId: 'json', label: 'Format' }, { kind: 'script' as const, stepId: 's2', scriptId: 'u1' }],
  };
  const script = { id: 'u1', name: 'S', body: 'return x', accepts: ['text' as const], produces: ['json' as const], timeoutMs: 3000, createdAt: T, updatedAt: T, imported: true };

  it('equals migrateX output for valid items', () => {
    for (const item of migratePipelineStore({ schemaVersion: 1, pipelines: [pipeline] }).pipelines) expect(roundTrip(pipelineCodec, item, undefined)).toEqual(item);
    for (const item of migrateUserScriptStore({ schemaVersion: 1, scripts: [script] }).scripts) expect(roundTrip(userScriptCodec, item, undefined)).toEqual(item);
  });

  it('rejects malformed items and sanitizes junk', () => {
    expect(pipelineCodec.decode({ ...pipeline, id: '' })).toBeNull();
    expect(pipelineCodec.decode({ ...pipeline, name: 5 })).toBeNull();
    expect(pipelineCodec.decode({ ...pipeline, schemaVersion: 2 })).toBeNull();
    const dirty = pipelineCodec.decode({ ...pipeline, junk: 1, lastRunStatus: 'bogus', steps: [{ kind: 'tool' }, pipeline.steps[0], 7] })!;
    expect(dirty).not.toHaveProperty('junk');
    expect(dirty).not.toHaveProperty('lastRunStatus');
    expect(dirty.steps).toEqual([pipeline.steps[0]]);
    expect(userScriptCodec.decode({ ...script, body: undefined })).toBeNull();
    expect(userScriptCodec.decode({ ...script, accepts: ['text', 'nope'], timeoutMs: -1 })).toMatchObject({ accepts: ['text'], timeoutMs: 3000 });
  });
});

describe('projects and workspace templates', () => {
  const project = { id: 'pr', name: 'P', createdAt: T, lastActivatedAt: T, panelTree: tree, openTabs: ['json'], pinnedPipelineIds: ['p1'], preferenceOverrides: { json: { indent: '4' } } };
  const template = { id: 't', name: 'T', description: 'x', builtIn: false, panelTree: tree, openTabs: ['json', 'base64'], preferenceOverrides: { json: { indent: '2' } } };

  it('equals migrateX output for valid items', () => {
    for (const item of migrateProjectStore({ schemaVersion: 1, projects: [project] }).projects) expect(roundTrip(projectCodec, item as never, undefined)).toEqual(item);
    for (const item of migrateWorkspaceTemplateStore({ schemaVersion: 1, userTemplates: [template], recentlyAppliedIds: [] }).userTemplates) {
      expect(roundTrip(workspaceTemplateCodec, item as never, undefined)).toEqual(item);
    }
  });

  it('sanitizes bad nested data like the domain helpers', () => {
    const decoded = projectCodec.decode({ ...project, panelTree: { kind: 'leaf' }, openTabs: ['a', 3], preferenceOverrides: { json: { a: 1 } }, junk: true })!;
    expect(decoded.panelTree).toBeNull();
    expect(decoded.openTabs).toEqual(['a']);
    expect(decoded.preferenceOverrides).toBeUndefined();
    expect(decoded).not.toHaveProperty('junk');
    expect(projectCodec.decode({ ...project, id: 3 })).toBeNull();
    expect(workspaceTemplateCodec.decode({ ...template, name: null })).toBeNull();
  });
});

describe('appearance', () => {
  it('matches sanitizeAppearance', () => {
    expect(appearanceCodec.decode(DEFAULT_APPEARANCE)).toEqual(DEFAULT_APPEARANCE);
    const dirty = { mode: 'nonsense', accent: 5, monoFont: { custom: 'Fira Code' }, uiFont: { custom: '<script>' }, junk: 1 };
    expect(appearanceCodec.decode(dirty)).toEqual(sanitizeAppearance(dirty));
    expect(appearanceCodec.decode('x')).toBeNull();
    expect(appearanceCodec.decode(null)).toBeNull();
    expect(appearanceCodec.idOf(DEFAULT_APPEARANCE)).toBe('default');
  });
});

describe('usage', () => {
  const v2 = {
    schemaVersion: 2, counts: { json: { count: 3, lastUsedAt: T } }, recentLog: [{ toolId: 'json', at: T }],
    dailyBuckets: [{ date: '2026-01-01', opens: 3, perTool: { json: 3 } }], trackingStartedOn: '2026-01-01',
  };

  it('equals migrateUsageStore for v2, v1 and newer', () => {
    expect(usageCodec.decode(v2)).toEqual(migrateUsageStore(v2));
    const v1 = { schemaVersion: 1, counts: v2.counts, recentLog: v2.recentLog };
    expect(usageCodec.decode(v1)).toEqual(migrateUsageStore(v1));
    const v3 = { ...v2, schemaVersion: 3 };
    expect(usageCodec.decode(v3)).toEqual(migrateUsageStore(v3));
    expect(roundTrip(usageCodec, migrateUsageStore(v2), undefined)).toEqual(migrateUsageStore(v2));
  });

  it('sanitizes bad buckets/start like migrateUsageStore and drops bad entries', () => {
    const dirty = { ...v2, dailyBuckets: [{ date: 'bad', opens: 1, perTool: {} }, ...v2.dailyBuckets, { date: '2026-01-02', opens: -1 }], trackingStartedOn: 'nope' };
    expect(usageCodec.decode(dirty)).toEqual(migrateUsageStore(dirty));
    const bad = { ...v2, counts: { json: { count: 'x' }, ok: v2.counts.json }, recentLog: [1, { toolId: 1 }, v2.recentLog[0]] };
    expect(usageCodec.decode(bad)).toMatchObject({ counts: { ok: v2.counts.json }, recentLog: v2.recentLog });
    expect(usageCodec.decode({ ...v2, schemaVersion: 0 })).toBeNull();
    expect(usageCodec.decode({ schemaVersion: 2 })).toBeNull();
  });
});

describe('workspace layout, scratchpad, native recents, history', () => {
  it('workspace layout equals migrateWorkspaceLayout (pruning stays caller-side)', () => {
    const layout = { schemaVersion: 1, openTabs: ['json'], panelTree: tree, focusedNodeId: 'l1', preferenceOverrides: { json: { a: 'b', c: 1 } } };
    expect(workspaceLayoutCodec.decode(layout)).toEqual(migrateWorkspaceLayout(layout));
    const migrated = migrateWorkspaceLayout(layout);
    expect(roundTrip(workspaceLayoutCodec, migrated, undefined)).toEqual(migrated);
    expect(workspaceLayoutCodec.decode({ ...layout, schemaVersion: 2 })).toBeNull();
    expect(workspaceLayoutCodec.decode({ ...layout, panelTree: 'x', focusedNodeId: 4 })).toMatchObject({ panelTree: null, focusedNodeId: null });
  });

  it('scratchpad equals migrateScratchpadStore', () => {
    const store = { schemaVersion: 1, snippets: [{ id: 's', title: 't', body: 'b', sourceToolId: 'json', createdAt: T }], drawerExpanded: true };
    expect(scratchpadCodec.decode(store)).toEqual(migrateScratchpadStore(store));
    expect(roundTrip(scratchpadCodec, migrateScratchpadStore(store), undefined)).toEqual(store);
    expect(scratchpadCodec.decode({ ...store, snippets: [store.snippets[0], { id: 1 }, null] })!.snippets).toHaveLength(1);
    expect(scratchpadCodec.decode({ ...store, drawerExpanded: 'yes' })!.drawerExpanded).toBe(false);
  });

  it('native recents equals migrateNativeRecentsStore', () => {
    const store = { schemaVersion: 1, entries: [{ path: 'C:\\a.json', name: 'a.json', extension: '.json', openedAt: T }] };
    expect(nativeRecentsCodec.decode(store)).toEqual(migrateNativeRecentsStore(store));
    expect(nativeRecentsCodec.decode({ ...store, entries: [...store.entries, { path: 1 }, 'x'] })!.entries).toEqual(store.entries);
    const many = { ...store, entries: Array.from({ length: 80 }, (_, i) => ({ ...store.entries[0], path: `p${i}` })) };
    expect(nativeRecentsCodec.decode(many)!.entries).toHaveLength(50);
  });

  it('history entry equals migrateHistoryEntry', () => {
    const entry = { id: 'h', schemaVersion: 1, toolId: 'json', createdAt: T, summary: 's', state: { a: 1 }, truncated: true };
    expect(historyEntryCodec.decode(entry)).toEqual(migrateHistoryEntry(entry));
    expect(historyEntryCodec.decode({ ...entry, junk: 1 })).not.toHaveProperty('junk');
    for (const bad of [{ ...entry, id: 5 }, { ...entry, schemaVersion: 2 }, { ...entry, summary: null }, null]) {
      expect(historyEntryCodec.decode(bad)).toBeNull();
      expect(migrateHistoryEntry(bad)).toBeUndefined();
    }
  });
});

describe('home layout', () => {
  const catalog: KindCatalog = {
    resolve: (id) => (id === 'notes' ? { id: 'notes', size: { minW: 2, minH: 1 }, multiInstance: true } : undefined),
  };
  const defaults = { instances: [], wide: [], narrow: [] };
  const ctx: HomeLayoutCodecContext = { catalog, defaults };
  const doc = {
    schemaVersion: 1, customized: true, narrowCustomized: false,
    instances: [{ id: 'notes-1', kindId: 'notes', config: {}, visible: true }, { id: 'x', kindId: 'gone', config: {}, visible: false }],
    wide: [{ id: 'notes-1', x: 0, y: 0, w: 6, h: 2 }], narrow: [], content: {},
  };

  it('equals migrateHomeLayoutStore and is idempotent', () => {
    const migrated = migrateHomeLayoutStore(doc, catalog, defaults);
    expect(homeLayoutCodec.decode(doc, ctx)).toEqual(migrated);
    expect(roundTrip(homeLayoutCodec, migrated, ctx)).toEqual(migrated);
  });

  it('never decodes (or rewrites) a newer-schema document but can read it', () => {
    const newer = { ...doc, schemaVersion: 2 };
    expect(isNewerHomeLayoutDocument(newer)).toBe(true);
    expect(isNewerHomeLayoutDocument(doc)).toBe(false);
    expect(homeLayoutCodec.decode(newer, ctx)).toBeNull();
    expect(decodeHomeLayoutReadOnly(newer, ctx)).toEqual(migrateHomeLayoutStore(newer, catalog, defaults));
  });

  it('rejects non-records and unknown older schemas', () => {
    expect(homeLayoutCodec.decode('x', ctx)).toBeNull();
    expect(homeLayoutCodec.decode({ ...doc, schemaVersion: 0 }, ctx)).toBeNull();
  });
});

describe('property: round trips and garbage', () => {
  const str = fc.string({ minLength: 1, maxLength: 12 });
  const date = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString());
  const leaf = fc.record({ kind: fc.constant('leaf' as const), nodeId: str, toolId: str });
  const panel = fc.oneof(leaf, fc.record({ kind: fc.constant('split' as const), nodeId: str, ratio: fc.double({ min: 0.1, max: 0.9, noNaN: true }), a: leaf, b: leaf }));

  const pipelineArb = fc.record({
    schemaVersion: fc.constant(1 as const), id: str, name: str, steps: fc.array(fc.oneof(
      fc.record({ kind: fc.constant('tool' as const), stepId: str, toolId: str }),
      fc.record({ kind: fc.constant('script' as const), stepId: str, scriptId: str }),
    ), { maxLength: 5 }), createdAt: date, updatedAt: date,
  });
  const projectArb = fc.record({
    id: str, name: str, createdAt: date, panelTree: fc.option(panel, { nil: null }),
    openTabs: fc.array(str, { maxLength: 5 }), pinnedPipelineIds: fc.array(str, { maxLength: 5 }),
  });

  it('decode(encode(x)) == x for valid items', () => {
    fc.assert(fc.property(pipelineArb, (p) => { expect(roundTrip(pipelineCodec, p, undefined)).toEqual(p); }));
    fc.assert(fc.property(projectArb, (p) => { expect(roundTrip(projectCodec, p, undefined)).toEqual(p); }));
    fc.assert(fc.property(
      fc.record({ id: str, schemaVersion: fc.constant(1 as const), toolId: str, createdAt: date, summary: fc.string(), state: fc.dictionary(str, fc.jsonValue()) }),
      (h) => { expect(roundTrip(historyEntryCodec, h, undefined)).toEqual(JSON.parse(JSON.stringify(h))); },
    ));
  });

  it('arbitrary garbage never throws and yields null or a re-decodable value', () => {
    const ctx: HomeLayoutCodecContext = { catalog: { resolve: () => undefined }, defaults: { instances: [], wide: [], narrow: [] } };
    fc.assert(fc.property(fc.anything(), (raw) => {
      for (const codec of Object.values(ENTITY_CODECS)) {
        const out = codec.decode(raw, ctx);
        if (out !== null) expect(codec.decode(JSON.parse(JSON.stringify(codec.encode(out))), ctx)).toEqual(JSON.parse(JSON.stringify(out)));
      }
    }), { numRuns: 200 });
  });
});
