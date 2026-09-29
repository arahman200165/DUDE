import { Component, computed, inject, input } from '@angular/core';
import { PlatformService } from '../../../core/platform/platform.service';
import { ToolDefinition } from '../../models/tool-definition.model';
import { platformCapabilities } from '../../../core/platform/capability-catalog';
import { StatusGlyph } from '../status-glyph/status-glyph';

/**
 * Desktop capability badge in ToolShell's header (Phase 25 Item 10, reworked for Phase 26 Item 7
 * on the closed `capabilities` vocabulary). It mirrors `SecurityBadge`/`OfflineBadge`: hidden when
 * the tool declares no platform capability.
 * - Web, some feature `unavailable`: "Some features need desktop" (warning). Paired with the
 *   inline `<app-desktop-only-control>` stand-ins inside the tool.
 * - Web, only `fallback`s: "More capable on desktop" (upsell). It works here, better there.
 * - Desktop: a quiet "Desktop-enhanced" confirmation.
 */
@Component({
  selector: 'app-desktop-capability-badge',
  imports: [StatusGlyph],
  templateUrl: './desktop-capability-badge.html',
})
export class DesktopCapabilityBadge {
  private readonly platform = inject(PlatformService);
  readonly definition = input<ToolDefinition | undefined>(undefined);

  protected readonly capabilities = computed(() => platformCapabilities(this.definition()?.capabilities));
  protected readonly isDesktop = computed(() => this.platform.isDesktop());
  protected readonly hasUnavailable = computed(() => this.capabilities().some((capability) => capability.web === 'unavailable'));
  protected readonly title = computed(() =>
    this.capabilities()
      .map((capability) => (capability.web === 'unavailable' ? `Desktop only: ${capability.note}` : `Better on desktop: ${capability.note}`))
      .join(' · '),
  );
}
