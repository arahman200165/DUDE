import { Component, Injector, Type, computed, effect, inject, input, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { WORKSPACE_HOST_CONTEXT } from '../../../core/workspace/workspace-host-context';
import { ErrorPanel } from '../../../shared/components/error-panel/error-panel';
import { BusyIndicator } from '../../../shared/components/busy-indicator/busy-indicator';
import { ToolLoadFailure } from '../../../shared/components/tool-load-failure/tool-load-failure';

/**
 * Mounts a tool by id outside its own route, via the tool's existing lazy `ToolDefinition.load()`
 * (the same `Promise<Type<unknown>>` `buildToolRoutes()` already uses for normal routing) and
 * `NgComponentOutlet` — see `core/workspace/AGENTS.md`'s "why not named router outlets" rationale.
 * Provides `WORKSPACE_HOST_CONTEXT` so the mounted tool's own `ToolShell` can resolve which tool
 * it is without a route.
 *
 * Capture/restore of a tool's live state across tab switches (Milestone 293's
 * `WorkspaceStateService`) is not wired up yet — for now, switching which tool a leaf shows simply
 * (re)mounts a fresh instance, exactly like navigating to a fresh route.
 */
@Component({
  selector: 'app-tool-host',
  imports: [NgComponentOutlet, ErrorPanel, BusyIndicator, ToolLoadFailure],
  templateUrl: './tool-host.html',
})
export class ToolHost {
  private readonly registry = inject(ToolRegistryService);
  private readonly parentInjector = inject(Injector);

  readonly toolId = input.required<string>();

  protected readonly definition = computed(() => this.registry.getById(this.toolId()));
  protected readonly componentType = signal<Type<unknown> | null>(null);
  protected readonly loadError = signal<string | null>(null);
  /**
   * The tool's code failed to download (offline before it was ever cached, or a stale tab after a
   * deploy). A restored workspace shows the same explanatory `ToolLoadFailure` as a direct route
   * (Phase 26 Item 14), not a raw error string.
   */
  protected readonly chunkFailed = signal(false);

  protected readonly childInjector = computed<Injector | null>(() => {
    const definition = this.definition();
    if (!definition) return null;

    return Injector.create({
      parent: this.parentInjector,
      providers: [{ provide: WORKSPACE_HOST_CONTEXT, useValue: { toolId: definition.id } }],
    });
  });

  constructor() {
    effect((onCleanup) => {
      const definition = this.definition();
      this.componentType.set(null);
      this.loadError.set(null);
      this.chunkFailed.set(false);

      if (!definition) {
        this.loadError.set(`Unknown tool "${this.toolId()}".`);
        return;
      }

      let cancelled = false;
      definition
        .load()
        .then((loaded) => {
          if (!cancelled) this.componentType.set(loaded as Type<unknown>);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.warn(`[DUDE] Failed to load tool "${definition.id}" in a workspace panel`, error);
          this.chunkFailed.set(true);
        });

      onCleanup(() => {
        cancelled = true;
      });
    });
  }
}
