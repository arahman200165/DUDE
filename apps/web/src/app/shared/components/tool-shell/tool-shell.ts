import { Component, OnDestroy, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { WORKSPACE_HOST_CONTEXT } from '../../../core/workspace/workspace-host-context';
import { ScratchpadService } from '../../../core/workspace/scratchpad.service';
import { HistoryService } from '../../../core/history/history.service';
import { recordHistoryOnDestroy } from '../../../core/history/history-recorder';
import { UsageService } from '../../../core/usage/usage.service';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { RelatedToolsPanel } from '../related-tools-panel/related-tools-panel';
import { CATEGORY_METADATA } from "@dude/shared-types/shared/models/tool-category.model";
import { OfflineBadge } from '../offline-badge/offline-badge';
import { CategoryIcon } from '../category-icon/category-icon';
import { SecurityBadge } from '../security-badge/security-badge';
import { DesktopCapabilityBadge } from '../desktop-capability-badge/desktop-capability-badge';
import { ToolShareMenu } from '../tool-share-menu/tool-share-menu';
import { OpenInDesktop } from '../open-in-desktop/open-in-desktop';
import { DesktopHandoffService } from '../../../core/deep-link/desktop-handoff.service';
import { DudeDeepLink } from "@dude/domain/core/deep-link/deep-link.model";
import { ShareLinkService } from '../../../core/share/share-link.service';
import { StatusGlyph, StatusGlyphKind } from '../status-glyph/status-glyph';

@Component({
  selector: 'app-tool-shell',
  imports: [StatusGlyph, OfflineBadge, CategoryIcon, SecurityBadge, DesktopCapabilityBadge, RouterLink, RelatedToolsPanel, ToolShareMenu, OpenInDesktop],
  templateUrl: './tool-shell.html',
})
export class ToolShell implements OnDestroy {
  private readonly connectivity = inject(ConnectivityService);
  private readonly router = inject(Router);
  private readonly registry = inject(ToolRegistryService);
  private readonly hostContext = inject(WORKSPACE_HOST_CONTEXT);
  private readonly scratchpad = inject(ScratchpadService);
  private readonly history = inject(HistoryService);
  private readonly usage = inject(UsageService);
  protected readonly favorites = inject(FavoritesService);
  protected readonly share = inject(ShareLinkService);
  protected readonly handoff = inject(DesktopHandoffService);

  /**
   * Optional override for tools whose network need is a runtime condition rather than a
   * static fact (e.g. only fetching when a particular panel is open) — when omitted, this
   * resolves from the registered `ToolDefinition`'s `network.required` (DUDE_PRD.md §21
   * Phase 22 Items 2/6: single source of truth, not duplicated at every call site).
   */
  readonly networkRequired = input<boolean | undefined>(undefined);

  protected readonly effectiveNetworkRequired = computed(
    () => this.networkRequired() ?? this.definition()?.network?.required ?? false,
  );
  protected readonly showOfflineBadge = computed(
    () => this.effectiveNetworkRequired() && !this.connectivity.online(),
  );

  /**
   * Outside Workspace (a tool's own direct route), `hostContext` is `null` (the token's default)
   * and this falls back to the existing route-derived lookup, unchanged. Inside Workspace,
   * `ToolHost` provides an explicit `toolId` via DI, since two tools can be mounted at once and
   * `router.url` can only ever point at one of them — see `core/workspace/workspace-host-context.ts`.
   */
  protected readonly definition = computed(() => {
    const hostContext = this.hostContext;
    return hostContext ? this.registry.getById(hostContext.toolId) : this.registry.getByRoute(this.router.url);
  });
  protected readonly category = computed(() => this.definition()?.category);
  /** Promoted into the header once the user has said (or shown) they have Desktop DUDE (Phase 26 Item 8). */
  protected readonly headerDesktopLink = computed<DudeDeepLink | null>(() => {
    const definition = this.definition();
    return definition && this.handoff.enabled && this.handoff.desktopInstalled() ? { action: 'open', target: 'tool', id: definition.id } : null;
  });
  /** "Loaded from link" notice (Phase 26 Item 12): shown once for the tool a share link just prefilled. */
  protected readonly loadedFromLink = computed(() => {
    const definition = this.definition();
    return !!definition && this.share.received() === definition.id;
  });
  protected readonly categoryMeta = computed(() => {
    const category = this.category();
    return category ? CATEGORY_METADATA[category] : undefined;
  });

  /**
   * Confidence-tier badge (DUDE_PRD.md §21 Phase 23 Item 1) — resolved here, once, rather than
   * duplicated as an inline 3-way ternary in the template (mirrors `SecurityBadge`'s
   * computed-in-.ts pattern). A missing `status` displays and styles as 'experimental', the
   * least-confident tier, rather than silently defaulting to something stronger.
   *
   * `verified`'s `title` surfaces `verification.summary` (Phase 23 Item 14's "Verified Tool
   * Badge") — a compact explanation of what was actually tested, never a bare "trust us" claim.
   */
  protected readonly statusBadge = computed(() => {
    const definition = this.definition();
    const status = definition?.status ?? 'experimental';
    const classes: Record<'experimental' | 'stable' | 'verified', string> = {
      experimental: 'border-warning/40 bg-warning/10 text-warning',
      stable: 'border-success/40 bg-success/10 text-success',
      verified: 'border-accent/40 bg-accent/10 text-accent',
    };
    const title = status === 'verified' ? (definition?.verification?.summary ?? '') : '';
    const glyph: Record<'experimental' | 'stable' | 'verified', StatusGlyphKind> = { experimental: 'warning', stable: 'neutral', verified: 'success' };
    return { label: status, classes: classes[status], title, glyph: glyph[status] };
  });

  /**
   * Local Usage Frequency / Recently Used Tools (DUDE_PRD.md §21 Phase 24 Items 5/6) — the "open"
   * counterpart to `ngOnDestroy`'s History capture below, recording only `{toolId, timestamp}`
   * (never content) for every tool uniformly. Fires once per mount, correct whether reached via a
   * direct route or a Workspace panel, since `definition()` already resolves either way.
   */
  constructor() {
    const definition = this.definition();
    if (definition) this.usage.recordOpen(definition.id);
  }

  /** Favorites / Pinned Tools (DUDE_PRD.md §21 Phase 24 Item 7) — a star toggle beside the badges. */
  protected readonly isPinned = computed(() => {
    const definition = this.definition();
    return definition ? this.favorites.isToolPinned(definition.id) : false;
  });

  protected togglePin(): void {
    const definition = this.definition();
    if (definition) this.favorites.toggleTool(definition.id);
  }

  /**
   * Manual scratchpad capture (DUDE_PRD.md §21 Phase 21 Item 4) — works on every tool, everywhere,
   * independent of whether the Workspace tab/panel UI is in use at all. Sends the current text
   * selection if there is one, falling back to the tool's own description so a note is never
   * empty; the user renames/edits it from the drawer afterward.
   */
  protected sendToScratchpad(): void {
    const definition = this.definition();
    const selection = window.getSelection()?.toString().trim();
    this.scratchpad.addSnippet(
      definition?.title ?? 'Untitled',
      selection && selection.length > 0 ? selection : (definition?.description ?? ''),
      definition?.id,
    );
  }

  /**
   * The single History capture trigger (DUDE_PRD.md §21 Phase 21 Item 5) — fires identically
   * whether the tool was torn down by leaving its own route or by the Workspace swapping a panel's
   * tool, since `ToolShell` is nested inside every tool's own template either way. Fire-and-forget:
   * Angular doesn't await `ngOnDestroy`, and the dynamic-import + IndexedDB write can safely finish
   * after the component itself is gone.
   */
  ngOnDestroy(): void {
    const definition = this.definition();
    if (definition) void recordHistoryOnDestroy(definition.id, this.history);
  }
}
