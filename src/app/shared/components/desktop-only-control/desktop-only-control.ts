import { Component, computed, inject, input } from '@angular/core';
import { PlatformService } from '../../../core/platform/platform.service';
import { PLATFORM_CAPABILITIES } from '../../../core/platform/capability-catalog';
import { PlatformCapabilityId } from '../../models/tool-capability.model';

/**
 * Desktop-Only Feature Badges, inline form (DUDE_PRD.md §21 Phase 26 Item 7). A tool drops this
 * beside a control it only renders on desktop. On the web it shows a disabled, clearly badged
 * stand-in, so the feature is visible and explained instead of mysteriously absent. On desktop it
 * renders nothing (the tool's real control is there). Conformance requires one per
 * `web: 'unavailable'` capability a tool declares.
 */
@Component({
  selector: 'app-desktop-only-control',
  template: `
    @if (!platform.isDesktop()) {
      <button
        type="button"
        disabled
        aria-disabled="true"
        class="inline-flex cursor-not-allowed items-center gap-1 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-ui text-text-muted/70"
        [title]="title()"
      >
        {{ label() }}
        <span class="rounded-sm border border-warning/40 px-1 font-mono text-ui-xs uppercase text-warning">Desktop</span>
      </button>
    }
  `,
  host: { class: 'contents' },
})
export class DesktopOnlyControl {
  protected readonly platform = inject(PlatformService);

  readonly capability = input.required<PlatformCapabilityId>();
  readonly label = input.required<string>();

  protected readonly title = computed(() => `${PLATFORM_CAPABILITIES[this.capability()].label} is available in Desktop DUDE, not in the browser.`);
}
