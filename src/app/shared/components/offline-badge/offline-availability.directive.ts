import { Directive, computed, inject, input } from '@angular/core';
import { OfflineReadinessService } from '../../../core/offline/offline-readiness.service';

/**
 * Dims a tool entry (sidebar, deck, search, command palette, rails) while the web companion is
 * offline and that tool isn't cached yet (DUDE_PRD.md §21 Phase 26 Item 10). The entry stays
 * clickable: opening it lands on `ToolLoadFailure`, which explains why and how to cache it, rather
 * than a hidden entry the user can't account for. Does nothing online, on desktop, and in dev.
 */
@Directive({
  selector: '[appOfflineAvailability]',
  host: {
    '[class.opacity-50]': 'unavailable()',
    '[attr.title]': "unavailable() ? 'Not available offline yet: open it once while online' : null",
    '[attr.data-offline-unavailable]': 'unavailable() || null',
  },
})
export class OfflineAvailability {
  private readonly readiness = inject(OfflineReadinessService);

  readonly appOfflineAvailability = input.required<string | undefined>();

  protected readonly unavailable = computed(() => {
    const id = this.appOfflineAvailability();
    return id !== undefined && this.readiness.unavailableOffline(id);
  });
}
