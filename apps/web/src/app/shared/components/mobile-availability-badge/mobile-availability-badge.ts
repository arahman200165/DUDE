import { Component, InjectionToken, computed, inject, input } from '@angular/core';
import { MOBILE_TOOL_IDS } from '@dude/tool-registry/mobile-tool-ids.generated';

/**
 * Tool IDs with an executable Android binding. Defaults to the list generated from
 * `apps/mobile/src/tools/<id>/<id>.mobile-bindings.ts` (`scripts/generate-mobile-bindings.mjs`), so
 * adding a mobile binding never needs a shell/core edit. Tests provide their own list.
 */
export const MOBILE_TOOL_IDS_TOKEN = new InjectionToken<readonly string[]>('MOBILE_TOOL_IDS', {
  providedIn: 'root',
  factory: () => MOBILE_TOOL_IDS,
});

/** "Also on Android" indicator in ToolShell's header; hidden unless the tool has an Android binding. */
@Component({
  selector: 'app-mobile-availability-badge',
  templateUrl: './mobile-availability-badge.html',
})
export class MobileAvailabilityBadge {
  private readonly mobileToolIds = inject(MOBILE_TOOL_IDS_TOKEN);
  readonly toolId = input<string | undefined>(undefined);

  protected readonly available = computed(() => {
    const id = this.toolId();
    return id !== undefined && this.mobileToolIds.includes(id);
  });
}
