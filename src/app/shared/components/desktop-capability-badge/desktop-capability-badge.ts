import { Component, computed, inject, input } from '@angular/core';
import { PlatformService } from '../../../core/platform/platform.service';
import { ToolDefinition } from '../../models/tool-definition.model';
import { platformCapabilities } from '../../../core/platform/capability-catalog';

/**
 * Desktop Capability Indicators (DUDE_PRD.md §21 Phase 25 Item 10) -- mirrors `SecurityBadge`/
 * `OfflineBadge`/`UpdateBadge`'s shape exactly: web shows an upsell tone (there's something better
 * on desktop), desktop shows a quiet confirmation (already got it). Hidden entirely for a tool with
 * no platform `capabilities` declared, same "hidden when nothing to say" precedent as those badges.
 */
@Component({
  selector: 'app-desktop-capability-badge',
  templateUrl: './desktop-capability-badge.html',
})
export class DesktopCapabilityBadge {
  private readonly platform = inject(PlatformService);
  readonly definition = input<ToolDefinition | undefined>(undefined);

  protected readonly capabilities = computed(() => platformCapabilities(this.definition()?.capabilities));
  protected readonly isDesktop = computed(() => this.platform.isDesktop());
  protected readonly title = computed(() => this.capabilities().map((capability) => capability.note).join(' · '));
}
