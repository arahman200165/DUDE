import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectService } from './project.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('ProjectService', () => {
  let service: ProjectService;
  let workspaceLayout: WorkspaceLayoutService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProjectService);
    workspaceLayout = TestBed.inject(WorkspaceLayoutService);
  });

  it('starts with no projects', () => {
    expect(service.projects()).toEqual([]);
  });

  it('creates a project capturing the current live layout', () => {
    workspaceLayout.openTool('base64');
    const project = service.create('My Project');

    expect(project.name).toBe('My Project');
    expect(project.openTabs).toEqual(['base64']);
    expect(service.projects().some((p) => p.id === project.id)).toBe(true);
  });

  it('renames a project', () => {
    const project = service.create('Original');
    service.rename(project.id, 'Renamed');
    expect(service.getById(project.id)?.name).toBe('Renamed');
  });

  it('removes a project', () => {
    const project = service.create('Temporary');
    service.remove(project.id);
    expect(service.getById(project.id)).toBeUndefined();
  });

  it('activate() applies the project layout to the live workspace and stamps lastActivatedAt', () => {
    workspaceLayout.openTool('json');
    const project = service.create('Data Cleanup');
    workspaceLayout.openTool('base64'); // mutate live layout away from the saved snapshot

    service.activate(project.id);

    expect(workspaceLayout.openTabs()).toEqual(project.openTabs);
    expect(service.getById(project.id)?.lastActivatedAt).toBeTruthy();
  });

  it('saveCurrentLayoutInto() re-captures the live layout into an existing project', () => {
    const project = service.create('Evolving');
    workspaceLayout.openTool('base64');

    service.saveCurrentLayoutInto(project.id);

    expect(service.getById(project.id)?.openTabs).toEqual(['base64']);
  });

  it('adds and removes a pinned pipeline id without duplication', () => {
    const project = service.create('With Pipeline');
    service.addPinnedPipeline(project.id, 'pipeline-1');
    service.addPinnedPipeline(project.id, 'pipeline-1');

    expect(service.getById(project.id)?.pinnedPipelineIds).toEqual(['pipeline-1']);

    service.removePinnedPipeline(project.id, 'pipeline-1');
    expect(service.getById(project.id)?.pinnedPipelineIds).toEqual([]);
  });

  it('recentTools() only returns entries whose toolId is one of the project openTabs', () => {
    workspaceLayout.openTool('base64');
    const project = service.create('Filtered');

    const recent = service.recentTools(project.id);
    expect(recent.every((entry) => 'toolId' in entry && entry.toolId === 'base64')).toBe(true);
  });

  it('recentlyActivated() returns only-ever-activated projects, most-recent first, capped', async () => {
    const a = service.create('A');
    const b = service.create('B');
    service.create('Never Activated');

    service.activate(a.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    service.activate(b.id);

    expect(service.recentlyActivated(10).map((p) => p.id)).toEqual([b.id, a.id]);
    expect(service.recentlyActivated(1).map((p) => p.id)).toEqual([b.id]);
  });

  it('survives a fresh service instance via persistence', async () => {
    const project = service.create('Persisted');
    await stable();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(ProjectService);

    expect(freshService.projects().some((p) => p.id === project.id)).toBe(true);
  });
});
