import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { PROJECT_COMMAND_SOURCE_PROVIDERS, ProjectCommandSource } from './project-command-source';
import { ProjectService } from './project.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';
import { routes } from '../routing/app.routes';

describe('ProjectCommandSource', () => {
  let source: ProjectCommandSource;
  let projectStore: ProjectService;
  let workspaceLayout: WorkspaceLayoutService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...PROJECT_COMMAND_SOURCE_PROVIDERS] });
    source = TestBed.inject(ProjectCommandSource);
    projectStore = TestBed.inject(ProjectService);
    workspaceLayout = TestBed.inject(WorkspaceLayoutService);
  });

  it('exposes one "Open Project" command per project', () => {
    const project = projectStore.create('My Project');
    expect(source.commands().some((c) => c.title === `Open Project: ${project.name}` && c.kind === 'project')).toBe(true);
  });

  it('activates the project directly when the current layout is empty', async () => {
    workspaceLayout.openTool('base64');
    const project = projectStore.create('My Project');
    workspaceLayout.applyLayout(null, []); // reset the live layout back to empty before activating
    const confirmSpy = vi.spyOn(window, 'confirm');

    await source.commands().find((c) => c.id === `project:open:${project.id}`)!.execute();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(workspaceLayout.openTabs()).toEqual(project.openTabs);
  });

  it('asks for confirmation before replacing a non-empty layout, and honors "cancel"', async () => {
    const project = projectStore.create('My Project');
    workspaceLayout.openTool('base64');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await source.commands().find((c) => c.id === `project:open:${project.id}`)!.execute();

    expect(workspaceLayout.openTabs()).toEqual(['base64']);
  });
});
