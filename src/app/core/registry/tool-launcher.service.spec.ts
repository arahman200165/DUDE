import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolLauncherService } from './tool-launcher.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';
import { TOOL_DEFINITIONS } from './tool-definitions';

class FakeRouter {
  url = '/';
  navigateByUrl = vi.fn();
}

describe('ToolLauncherService', () => {
  let router: FakeRouter;
  let service: ToolLauncherService;
  const tool = TOOL_DEFINITIONS[0];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    router = new FakeRouter();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    service = TestBed.inject(ToolLauncherService);
  });

  it('navigates directly when outside the Workspace', () => {
    router.url = '/';
    service.open(tool);
    expect(router.navigateByUrl).toHaveBeenCalledWith(tool.route);
  });

  it('opens the tool as a Workspace tab instead of navigating when inside /workspace', () => {
    router.url = '/workspace';
    const workspaceLayout = TestBed.inject(WorkspaceLayoutService);

    service.open(tool);

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(workspaceLayout.openTabs()).toContain(tool.id);
  });
});
