import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ResumeWorkPanel } from './resume-work-panel';
import { ProjectService } from '../../../core/project/project.service';
import { WorkspaceTemplateService } from '../../../core/workspace/workspace-template.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { BUILT_IN_TEMPLATES } from '../../../core/workspace/workspace-template.model';
import { routes } from '../../../core/routing/app.routes';

describe('ResumeWorkPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function create(projects: unknown[] = [], workspaces: unknown[] = [], pipelines: unknown[] = []) {
    const fixture = TestBed.createComponent(ResumeWorkPanel);
    fixture.componentRef.setInput('projects', projects);
    fixture.componentRef.setInput('workspaces', workspaces);
    fixture.componentRef.setInput('pipelines', pipelines);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the empty-state CTA row when there is nothing to resume', () => {
    const fixture = create();

    expect(fixture.nativeElement.textContent).toContain('Nothing to resume yet.');
    expect(fixture.nativeElement.textContent).toContain('Browse tools');
    expect(fixture.nativeElement.textContent).toContain('Create a project');
    expect(fixture.nativeElement.textContent).toContain('Create a workspace');
  });

  it('activates a project directly when the current layout is empty', () => {
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    workspaceLayout.openTool('base64');
    const projectStore = TestBed.inject(ProjectService);
    const project = projectStore.create('My Project');
    workspaceLayout.applyLayout(null, []); // reset the live layout back to empty before activating

    const fixture = create([project]);
    const confirmSpy = vi.spyOn(window, 'confirm');

    (fixture.nativeElement.querySelector('button[type="button"]:not([role="tab"])') as HTMLButtonElement).click();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(workspaceLayout.openTabs()).toEqual(project.openTabs);
    expect(projectStore.getById(project.id)?.lastActivatedAt).toBeTruthy();
  });

  it('asks for confirmation before replacing a non-empty layout when activating a project, and honors "cancel"', () => {
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    const projectStore = TestBed.inject(ProjectService);
    const project = projectStore.create('My Project');
    workspaceLayout.openTool('base64');

    const fixture = create([project]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    (fixture.nativeElement.querySelector('button[type="button"]:not([role="tab"])') as HTMLButtonElement).click();

    expect(workspaceLayout.openTabs()).toEqual(['base64']);
  });

  it('applies a workspace template directly when the current layout is empty', () => {
    const template = BUILT_IN_TEMPLATES[0];
    const fixture = create([], [template]);
    const confirmSpy = vi.spyOn(window, 'confirm');

    (fixture.nativeElement.querySelector('button[type="button"]:not([role="tab"])') as HTMLButtonElement).click();

    expect(confirmSpy).not.toHaveBeenCalled();
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    expect(workspaceLayout.openTabs()).toEqual(template.openTabs);
  });

  it('records the applied template so it resurfaces via WorkspaceTemplateService.recentlyApplied()', () => {
    const template = BUILT_IN_TEMPLATES[0];
    const fixture = create([], [template]);

    (fixture.nativeElement.querySelector('button[type="button"]:not([role="tab"])') as HTMLButtonElement).click();

    const templateStore = TestBed.inject(WorkspaceTemplateService);
    expect(templateStore.recentlyApplied(10).map((t) => t.id)).toEqual([template.id]);
  });

  it('shows tabs only for non-empty sources, and switches between them', () => {
    const project = TestBed.inject(ProjectService).create('My Project');
    const template = BUILT_IN_TEMPLATES[0];

    const fixture = create([project], [template]);
    const tabs: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button[role="tab"]'));

    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['projects', 'workspaces']);
    expect(fixture.nativeElement.textContent).toContain('My Project');

    tabs[1].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(template.name);
  });

  it('renders no tab bar when only one source has items', () => {
    const project = TestBed.inject(ProjectService).create('My Project');
    const fixture = create([project]);

    expect(fixture.nativeElement.querySelector('[role="tablist"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('My Project');
  });
});
