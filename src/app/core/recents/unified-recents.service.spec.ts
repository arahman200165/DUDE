import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { UnifiedRecentsService } from './unified-recents.service';
import { UsageService } from '../usage/usage.service';
import { PipelineStoreService } from '../pipeline/pipeline-store.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';
import { NativeRecentsService } from '../native-recents/native-recents.service';
import { createPipeline } from '../pipeline/pipeline.model';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';

describe('UnifiedRecentsService', () => {
  let service: UnifiedRecentsService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(UnifiedRecentsService);
  });

  it('starts empty', () => {
    expect(service.entries()).toEqual([]);
  });

  it('includes a tool opened via UsageService, with its real title', () => {
    const toolId = TOOL_DEFINITIONS[0].id;
    TestBed.inject(UsageService).recordOpen(toolId);

    const entries = service.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'tool', toolId, title: TOOL_DEFINITIONS[0].title });
  });

  it('includes a pipeline only once it has actually been run (lastRunAt set)', () => {
    const pipelineStore = TestBed.inject(PipelineStoreService);
    const pipeline = createPipeline('My Pipeline');
    pipelineStore.save(pipeline);

    expect(service.entries()).toEqual([]);

    pipelineStore.save({ ...pipeline, lastRunAt: '2026-01-01T00:00:00.000Z', lastRunStatus: 'succeeded' });

    const entries = service.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'pipeline', pipelineId: pipeline.id, title: 'My Pipeline' });
  });

  it('includes a tool currently open in the workspace', () => {
    const toolId = TOOL_DEFINITIONS[0].id;
    TestBed.inject(WorkspaceLayoutService).openTool(toolId);

    const entries = service.entries();
    expect(entries.some((e) => e.kind === 'workspace-tab' && e.toolId === toolId)).toBe(true);
  });

  it('keeps a tool-open entry and a workspace-tab entry for the same tool id distinct', () => {
    const toolId = TOOL_DEFINITIONS[0].id;
    TestBed.inject(UsageService).recordOpen(toolId);
    TestBed.inject(WorkspaceLayoutService).openTool(toolId);

    const kinds = service.entries().map((e) => e.kind);
    expect(kinds).toContain('tool');
    expect(kinds).toContain('workspace-tab');
  });

  it('includes a native file opened via the desktop open flow', () => {
    TestBed.inject(NativeRecentsService).record({ path: 'C:/notes.md', name: 'notes.md', extension: '.md', openedAt: '2026-01-01T00:00:00.000Z' });

    const entries = service.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'native-file', path: 'C:/notes.md', title: 'notes.md' });
  });
});
