import { Injectable, computed, inject, signal } from '@angular/core';
import { PlatformService } from './platform.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';

/**
 * Crash/Restart Workspace Recovery (DUDE_PRD.md §21 Phase 25 Item 6). Workspace layout restoration
 * itself needs no new code here -- `'__workspace__'` already persists locally and already survives a
 * crash identically to a clean quit (`core/workspace/AGENTS.md`). This service only decides *whether
 * to say so*: `visible` is true for the one launch immediately following an unclean exit
 * (`PlatformService.wasRestoredAfterCrash`), only while there's actually something to report
 * (`openTabs().length > 0`), and only until the user dismisses it for this session.
 */
@Injectable({ providedIn: 'root' })
export class CrashRecoveryService {
  private readonly platform = inject(PlatformService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);
  private readonly dismissedSignal = signal(false);

  readonly visible = computed(
    () => this.platform.wasRestoredAfterCrash && !this.dismissedSignal() && this.workspaceLayout.openTabs().length > 0,
  );

  dismiss(): void {
    this.dismissedSignal.set(true);
  }
}
