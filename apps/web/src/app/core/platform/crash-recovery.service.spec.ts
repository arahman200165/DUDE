import { TestBed } from '@angular/core/testing';
import { CrashRecoveryService } from './crash-recovery.service';
import { PlatformService } from './platform.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';

describe('CrashRecoveryService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function withPlatform(wasRestoredAfterCrash: boolean): CrashRecoveryService {
    TestBed.configureTestingModule({ providers: [{ provide: PlatformService, useValue: { isDesktop: () => true, wasRestoredAfterCrash } }] });
    return TestBed.inject(CrashRecoveryService);
  }

  it('is not visible when the last exit was clean', () => {
    const service = withPlatform(false);
    TestBed.inject(WorkspaceLayoutService).openTool('base64');
    expect(service.visible()).toBe(false);
  });

  it('is not visible when restored, but there is nothing open to report', () => {
    const service = withPlatform(true);
    expect(service.visible()).toBe(false);
  });

  it('is visible when restored after a crash and there is an open workspace', () => {
    const service = withPlatform(true);
    TestBed.inject(WorkspaceLayoutService).openTool('base64');
    expect(service.visible()).toBe(true);
  });

  it('dismiss() hides it for the rest of the session', () => {
    const service = withPlatform(true);
    TestBed.inject(WorkspaceLayoutService).openTool('base64');
    expect(service.visible()).toBe(true);

    service.dismiss();

    expect(service.visible()).toBe(false);
  });
});
