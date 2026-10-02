import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityCommit } from '@dude/contracts';
import { createPipeline, createUserScript } from '@dude/domain/core/pipeline/pipeline.model';
import { FavoritesService } from '../../favorites/favorites.service';
import { DudeBundleService } from '../../backup/dude-bundle.service';
import { PipelineStoreService } from '../../pipeline/pipeline-store.service';
import { TOOL_DEFINITIONS } from '../../registry/tool-definitions';
import { fakeElectronBridge, fakeStore } from '../../platform/testing/fake-electron-bridge';
import { provideBootSnapshot } from '../device-store/boot-snapshot';
import { createDegradedMemoryBackend } from '../device-store/device-kv-backend';
import { installLocalBackend, resetLocalBackend } from '../local-backend-registry';

/** The real services over a recording fake bridge, as on desktop. */
describe('entity services on the desktop store', () => {
  let commits: EntityCommit[];
  let imports: EntityCommit[][];

  beforeEach(() => {
    localStorage.clear();
    commits = [];
    imports = [];
    const base = fakeStore();
    const store = {
      ...base,
      commitEntity: async (commit: EntityCommit) => {
        commits.push(commit);
        return base.commitEntity(commit);
      },
      importEntities: async (list: readonly EntityCommit[]) => {
        imports.push([...list]);
        return base.importEntities(list);
      },
    };
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge({ store }), configurable: true, writable: true });
    installLocalBackend(createDegradedMemoryBackend());
    TestBed.configureTestingModule({
      providers: [provideBootSnapshot({ boot: { status: 'ready', kv: [], records: [] } as never })],
    });
  });

  afterEach(() => {
    delete (window as { dude?: unknown }).dude;
    resetLocalBackend();
  });

  it('pinning a favorite commits a favorite entity', async () => {
    const toolId = TOOL_DEFINITIONS[0].id;
    const favorites = TestBed.inject(FavoritesService);
    favorites.toggleTool(toolId);
    expect(favorites.isToolPinned(toolId)).toBe(true);
    await vi.waitFor(() => expect(commits).toHaveLength(1));
    expect(commits).toMatchObject([{ entityType: 'favorite', entityId: `tool:${toolId}`, op: 'upsert' }]);
    favorites.toggleTool(toolId);
    await vi.waitFor(() => expect(commits).toHaveLength(2));
    expect(commits[1]).toMatchObject({ entityType: 'favorite', op: 'delete' });
  });

  it('a bundle import is one store call per entity type', async () => {
    const bundles = TestBed.inject(DudeBundleService);
    const source = createPipeline('Imported');
    const script = createUserScript('S');
    const plan = {
      conflictMode: 'skip',
      projects: { items: [], skipped: 0, replaced: 0 },
      workspaceTemplates: { items: [], skipped: 0, replaced: 0 },
      pipelines: { items: [source, createPipeline('Two')], skipped: 0, replaced: 0 },
      userScripts: { items: [script], skipped: 0, replaced: 0 },
      homeLayout: { items: [], skipped: 0, replaced: 0 },
      appearance: { items: [], skipped: 0, replaced: 0 },
      toolPreferences: {},
      toolInputs: {},
      invalid: [],
    };
    const result = await bundles.apply(plan as never);
    expect(result).toEqual({ ok: true, invalid: 0, errors: [] });
    expect(imports.map((list) => [list[0].entityType, list.length]).sort()).toEqual([
      ['pipeline', 2],
      ['user-script', 1],
    ]);
    expect(TestBed.inject(PipelineStoreService).pipelines()).toHaveLength(2);
  });

  it('counts and skips items a codec rejects', async () => {
    const bundles = TestBed.inject(DudeBundleService);
    const plan = {
      conflictMode: 'skip',
      projects: { items: [], skipped: 0, replaced: 0 },
      workspaceTemplates: { items: [], skipped: 0, replaced: 0 },
      pipelines: { items: [createPipeline('Ok'), { id: '' }], skipped: 0, replaced: 0 },
      userScripts: { items: [], skipped: 0, replaced: 0 },
      homeLayout: { items: [], skipped: 0, replaced: 0 },
      appearance: { items: [], skipped: 0, replaced: 0 },
      toolPreferences: {},
      toolInputs: {},
      invalid: [],
    };
    const result = await bundles.apply(plan as never);
    expect(result.invalid).toBe(1);
    expect(imports[0]).toHaveLength(1);
  });
});
