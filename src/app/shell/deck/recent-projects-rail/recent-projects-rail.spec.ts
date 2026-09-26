import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { RecentProjectsRail } from './recent-projects-rail';
import { ProjectService } from '../../../core/project/project.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { routes } from '../../../core/routing/app.routes';

describe('RecentProjectsRail', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('renders nothing when there are no recent projects', () => {
    const fixture = TestBed.createComponent(RecentProjectsRail);
    fixture.componentRef.setInput('projects', []);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('activates a project directly when the current layout is empty', () => {
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    workspaceLayout.openTool('base64');
    const projectStore = TestBed.inject(ProjectService);
    const project = projectStore.create('My Project');
    workspaceLayout.applyLayout(null, []); // reset the live layout back to empty before activating

    const fixture = TestBed.createComponent(RecentProjectsRail);
    fixture.componentRef.setInput('projects', [project]);
    fixture.detectChanges();
    const confirmSpy = vi.spyOn(window, 'confirm');

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(workspaceLayout.openTabs()).toEqual(project.openTabs);
    expect(projectStore.getById(project.id)?.lastActivatedAt).toBeTruthy();
  });

  it('asks for confirmation before replacing a non-empty layout, and honors "cancel"', () => {
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    const projectStore = TestBed.inject(ProjectService);
    const project = projectStore.create('My Project');
    workspaceLayout.openTool('base64');

    const fixture = TestBed.createComponent(RecentProjectsRail);
    fixture.componentRef.setInput('projects', [project]);
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(workspaceLayout.openTabs()).toEqual(['base64']);
  });
});
