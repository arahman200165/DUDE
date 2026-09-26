import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { RecentWorkspacesRail } from './recent-workspaces-rail';
import { WorkspaceTemplateService } from '../../../core/workspace/workspace-template.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { BUILT_IN_TEMPLATES } from '../../../core/workspace/workspace-template.model';
import { routes } from '../../../core/routing/app.routes';

describe('RecentWorkspacesRail', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('renders nothing when no template has ever been applied', () => {
    const fixture = TestBed.createComponent(RecentWorkspacesRail);
    fixture.componentRef.setInput('templates', []);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('applies a template directly when the current layout is empty', () => {
    const template = BUILT_IN_TEMPLATES[0];
    const fixture = TestBed.createComponent(RecentWorkspacesRail);
    fixture.componentRef.setInput('templates', [template]);
    fixture.detectChanges();
    const confirmSpy = vi.spyOn(window, 'confirm');

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(confirmSpy).not.toHaveBeenCalled();
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    expect(workspaceLayout.openTabs()).toEqual(template.openTabs);
  });

  it('asks for confirmation before replacing a non-empty layout, and honors "cancel"', () => {
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);
    workspaceLayout.openTool('base64');
    const template = BUILT_IN_TEMPLATES[0];
    const fixture = TestBed.createComponent(RecentWorkspacesRail);
    fixture.componentRef.setInput('templates', [template]);
    fixture.detectChanges();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    expect(workspaceLayout.openTabs()).toEqual(['base64']);
  });

  it('records the applied template so it resurfaces via WorkspaceTemplateService.recentlyApplied()', () => {
    const template = BUILT_IN_TEMPLATES[0];
    const fixture = TestBed.createComponent(RecentWorkspacesRail);
    fixture.componentRef.setInput('templates', [template]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

    const templateStore = TestBed.inject(WorkspaceTemplateService);
    expect(templateStore.recentlyApplied(10).map((t) => t.id)).toEqual([template.id]);
  });
});
