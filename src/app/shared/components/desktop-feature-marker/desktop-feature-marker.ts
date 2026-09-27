import { Component, computed, inject, input } from '@angular/core';
import { PlatformService } from '../../../core/platform/platform.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';

/**
 * A compact "has a desktop-only feature" marker for tool lists (sidebar, deck, search, palette;
 * Phase 26 Item 7). Web only, and only for tools declaring a `web: 'unavailable'` capability.
 * `fallback`-only tools work fully in the browser and aren't marked.
 */
@Component({
  selector: 'app-desktop-feature-marker',
  template: `
    @if (show()) {
      <span
        class="ml-auto shrink-0 rounded-sm border border-warning/40 px-1 font-mono text-[0.6rem] uppercase leading-tight text-warning"
        title="Some features of this tool need Desktop DUDE"
        aria-label="Some features need Desktop DUDE"
        >desk</span
      >
    }
  `,
  host: { class: 'contents' },
})
export class DesktopFeatureMarker {
  private readonly platform = inject(PlatformService);
  private readonly registry = inject(ToolRegistryService);

  readonly toolId = input.required<string | undefined>();

  protected readonly show = computed(() => {
    const id = this.toolId();
    return !this.platform.isDesktop() && id !== undefined && this.registry.hasWebUnavailableFeature(id);
  });
}
