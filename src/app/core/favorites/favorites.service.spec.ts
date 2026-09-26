import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FavoritesService } from './favorites.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { createPipeline } from '../pipeline/pipeline.model';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('FavoritesService', () => {
  let service: FavoritesService;
  const realToolId = TOOL_DEFINITIONS[0].id;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(FavoritesService);
  });

  it('starts with nothing pinned', () => {
    expect(service.isToolPinned(realToolId)).toBe(false);
    expect(service.pinnedTools()).toEqual([]);
    expect(service.pinnedPipelines()).toEqual([]);
  });

  it('toggles a tool pin on and off', () => {
    service.toggleTool(realToolId);
    expect(service.isToolPinned(realToolId)).toBe(true);
    expect(service.pinnedTools().map((t) => t.id)).toEqual([realToolId]);

    service.toggleTool(realToolId);
    expect(service.isToolPinned(realToolId)).toBe(false);
    expect(service.pinnedTools()).toEqual([]);
  });

  it('drops a pinned tool id that no longer resolves in the registry', () => {
    service.toggleTool('this-tool-does-not-exist');
    expect(service.isToolPinned('this-tool-does-not-exist')).toBe(true);
    expect(service.pinnedTools()).toEqual([]);
  });

  it('toggles a pipeline pin on and off, resolving via the live pipeline store', () => {
    const pipelineStore = TestBed.inject(PipelineStoreService);
    const pipeline = createPipeline('My Pipeline');
    pipelineStore.save(pipeline);

    service.togglePipeline(pipeline.id);
    expect(service.isPipelinePinned(pipeline.id)).toBe(true);
    expect(service.pinnedPipelines().map((p) => p.id)).toEqual([pipeline.id]);

    service.togglePipeline(pipeline.id);
    expect(service.pinnedPipelines()).toEqual([]);
  });

  it('drops a pinned pipeline id that has since been deleted', () => {
    const pipelineStore = TestBed.inject(PipelineStoreService);
    const pipeline = createPipeline('Doomed');
    pipelineStore.save(pipeline);
    service.togglePipeline(pipeline.id);

    pipelineStore.remove(pipeline.id);

    expect(service.isPipelinePinned(pipeline.id)).toBe(true);
    expect(service.pinnedPipelines()).toEqual([]);
  });

  it('survives a fresh service instance via persistence', async () => {
    service.toggleTool(realToolId);
    await stable();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(FavoritesService);

    expect(freshService.isToolPinned(realToolId)).toBe(true);
  });
});
