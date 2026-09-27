import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { UpdateService } from '../../../core/connectivity/update.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { PAGE_RELOAD } from '../../../core/offline/cache-inspector.service';

/**
 * Shown in place of a tool or shell page whose lazy chunk failed to load (DUDE_PRD.md §21 Phase 26 Item 10):
 * either offline before the tool was ever cached, or a stale tab after a deploy removed the chunk
 * it expected. Statically bundled into the shell by `core/registry/tool-routes.ts`, so it can
 * render even when nothing else is reachable. Also reused by workspace panels (`toolId` input).
 */
@Component({
  selector: 'app-tool-load-failure',
  imports: [RouterLink],
  templateUrl: './tool-load-failure.html',
})
export class ToolLoadFailure {
  private readonly router = inject(Router);
  private readonly registry = inject(ToolRegistryService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly update = inject(UpdateService);
  private readonly reload = inject(PAGE_RELOAD);

  /** Set by hosts that aren't the tool's own route (workspace panels). Defaults to the current URL. */
  readonly toolId = input<string | undefined>(undefined);

  protected readonly definition = computed(() => {
    const id = this.toolId();
    return id ? this.registry.getById(id) : this.registry.getByRoute(this.router.url);
  });
  protected readonly offline = computed(() => !this.connectivity.online());
  protected readonly updateReady = this.update.updateReady;
  protected readonly needsRepair = this.update.needsRepair;

  protected retry(): void {
    if (this.updateReady()) void this.update.activateUpdate();
    else this.reload();
  }
}
