import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { UsageService } from './usage.service';
import { HomePanelService } from '../home-panel/home-panel.service';
import { FavoritesService } from '../favorites/favorites.service';
import { SuggestionDismissalService } from '../suggestions/suggestion-dismissal.service';
import { WorkspaceTemplateService } from '../workspace/workspace-template.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';

/**
 * DUDE_PRD.md §21 Phase 24 Item 14 ("Private-by-Construction Usage Signals") — a mechanical check,
 * not just a documented claim, mirroring `tool-conformance.spec.ts`'s "checked, not just
 * documented" spirit. Every Phase 24 store is walked against an explicit key allow-list derived
 * directly from its own TypeScript interface: an unexpected key appearing in the real persisted
 * JSON (e.g. a future accidental `store.set({...store(), pastedText: someInput})`) fails this test
 * immediately, regardless of what the code comments claim.
 *
 * This checks *shape* (key names), not string content — see the individual AGENTS.md files
 * (`core/usage/`, `core/favorites/`, `core/suggestions/`, `core/workspace/`) for the design
 * reasoning that makes content-bearing fields structurally impossible here in the first place: none
 * of these interfaces have a field for raw tool input/output at all.
 */

async function readStore(key: string): Promise<unknown> {
  // `PersistenceService.signal(...)` writes via an `effect()`, which settles on the next
  // change-detection tick, not synchronously after `.set()` -- mirrors the same wait
  // `pipeline-store.service.spec.ts`'s own persistence test already needs.
  await TestBed.inject(ApplicationRef).whenStable();
  const raw = localStorage.getItem(key);
  expect(raw, `expected ${key} to have been written`).not.toBeNull();
  return JSON.parse(raw!);
}

/** Recursively asserts every object in `value` has only keys from `allowedKeys`. */
function assertOnlyKeys(value: unknown, allowedKeys: readonly string[], path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertOnlyKeys(item, allowedKeys, `${path}[${i}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const key of Object.keys(value)) {
    expect(allowedKeys, `unexpected key "${key}" at ${path} -- only ${JSON.stringify(allowedKeys)} are allowed`).toContain(key);
  }
}

describe('Phase 24 store shapes never carry tool content', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
  });

  it('__usage__:activity only ever has schemaVersion/counts/recentLog/dailyBuckets/trackingStartedOn, and nested entries only their fixed keys', async () => {
    const toolId = TOOL_DEFINITIONS[0].id;
    const usage = TestBed.inject(UsageService);
    usage.recordOpen(toolId);
    usage.recordOpen(TOOL_DEFINITIONS[1].id);

    const store = (await readStore('dude:v1:__usage__:activity')) as {
      counts: Record<string, unknown>;
      recentLog: readonly unknown[];
      dailyBuckets: readonly { date: string; opens: number; perTool: Record<string, number> }[];
      trackingStartedOn: string | null;
    };
    assertOnlyKeys(store, ['schemaVersion', 'counts', 'recentLog', 'dailyBuckets', 'trackingStartedOn']);
    assertOnlyKeys(Object.values(store.counts), ['count', 'lastUsedAt']);
    assertOnlyKeys(store.recentLog, ['toolId', 'at']);
    assertOnlyKeys(store.dailyBuckets, ['date', 'opens', 'perTool']);

    // Shape constraints (key names alone can't catch a content-bearing *value*): the 30H daily
    // aggregate is dates, integer counts and registry-style tool-id slugs — nothing else.
    const dayKey = /^\d{4}-\d{2}-\d{2}$/;
    expect(store.dailyBuckets.length).toBeLessThanOrEqual(30);
    expect(store.trackingStartedOn).toMatch(dayKey);
    for (const bucket of store.dailyBuckets) {
      expect(bucket.date).toMatch(dayKey);
      expect(Number.isInteger(bucket.opens) && bucket.opens >= 0).toBe(true);
      for (const [id, n] of Object.entries(bucket.perTool)) {
        expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
        expect(TOOL_DEFINITIONS.some((t) => t.id === id)).toBe(true);
        expect(Number.isInteger(n) && n > 0).toBe(true);
      }
      expect(Object.values(bucket.perTool).reduce((a, b) => a + b, 0)).toBe(bucket.opens);
    }
  });

  it('__home__:panel (user-authored) has only its fixed keys, and its text never reaches the usage store', async () => {
    const panel = TestBed.inject(HomePanelService);
    panel.setNote('a private note about acme-secret-project');
    panel.addLink('Docs', 'https://example.com/acme-secret-project');
    TestBed.inject(UsageService).recordOpen(TOOL_DEFINITIONS[0].id);

    const home = await readStore('dude:v1:__home__:panel');
    assertOnlyKeys(home, ['schemaVersion', 'note', 'links']);
    assertOnlyKeys((home as { links: unknown[] }).links, ['id', 'label', 'url']);

    // Panel content is the user's own local content; usage metrics must stay content-free.
    expect(JSON.stringify(await readStore('dude:v1:__usage__:activity'))).not.toContain('acme-secret-project');
  });

  it('__favorites__:pinned only ever has schemaVersion/toolIds/pipelineIds', async () => {
    TestBed.inject(FavoritesService).toggleTool(TOOL_DEFINITIONS[0].id);

    assertOnlyKeys(await readStore('dude:v1:__favorites__:pinned'), ['schemaVersion', 'toolIds', 'pipelineIds']);
  });

  it('__suggestions__:dismissedPipelineSuggestions is a bare array of key strings, no object structure at all', async () => {
    TestBed.inject(SuggestionDismissalService).dismiss('base64>json');

    const store = await readStore('dude:v1:__suggestions__:dismissedPipelineSuggestions');
    expect(Array.isArray(store)).toBe(true);
    for (const entry of store as unknown[]) expect(typeof entry).toBe('string');
  });

  it('__workspace-templates__:userTemplates only ever has the WorkspaceTemplate shape, panelTree only the PanelNode shape', async () => {
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    workspaceLayout.openTool(TOOL_DEFINITIONS[0].id);
    TestBed.inject(WorkspaceTemplateService).saveCurrentAsTemplate('My Layout');

    const store = (await readStore('dude:v1:__workspace-templates__:userTemplates')) as { userTemplates: readonly unknown[] };
    assertOnlyKeys(store, ['schemaVersion', 'userTemplates', 'recentlyAppliedIds']);
    assertOnlyKeys(store.userTemplates, ['id', 'name', 'description', 'builtIn', 'panelTree', 'openTabs']);
    for (const template of store.userTemplates as { panelTree: unknown }[]) {
      assertOnlyKeys(template.panelTree, ['kind', 'nodeId', 'toolId', 'ratio', 'a', 'b']);
    }
  });

  it("__pipelines__:saved never gained a new content-bearing field from Phase 24's lastRunAt/lastRunStatus addition", async () => {
    const pipelineStore = TestBed.inject(PipelineStoreService);
    pipelineStore.save({
      schemaVersion: 1,
      id: 'p1',
      name: 'Test',
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRunAt: new Date().toISOString(),
      lastRunStatus: 'succeeded',
    });

    const store = (await readStore('dude:v1:__pipelines__:saved')) as { pipelines: readonly unknown[] };
    assertOnlyKeys(store.pipelines, [
      'schemaVersion',
      'id',
      'name',
      'description',
      'steps',
      'createdAt',
      'updatedAt',
      'lastRunAt',
      'lastRunStatus',
    ]);
  });
});
