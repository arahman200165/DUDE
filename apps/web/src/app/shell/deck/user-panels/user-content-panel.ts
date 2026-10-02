import { Component, computed, inject, signal } from '@angular/core';
import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { ShortcutTarget, UserContent, emptyUserContent, hasUserContent } from "@dude/domain/core/home-layout/user-content.model";
import { ExternalLinkService } from '../../../core/platform/external-link.service';
import { PanelRegistryService } from '../../../core/registry/panel-registry.service';
import { DashboardPanel } from '../../../shared/components/dashboard-panel/dashboard-panel';
import { PANEL_CONTEXT } from '../../../shared/models/panel-context.model';
import { ShortcutResolverService } from './shortcut-resolver.service';
import { UserContentEditor } from './user-content-editor/user-content-editor';

const DEFAULT_TITLES = { text: 'Note', link: 'Links', shortcut: 'Shortcuts' } as const;

/**
 * Renderer for the three user-authored kinds (text, links, shortcuts). Content lives in the Home
 * layout store, keyed by this panel's instance id. Everything is shown as plain text; links are
 * plain anchors that only navigate when clicked (desktop routes the click through the external-link
 * bridge); a shortcut chip only runs its target when clicked. Mounting or restoring a layout never
 * opens, runs or fetches anything.
 */
@Component({
  selector: 'app-user-content-panel',
  imports: [DashboardPanel, UserContentEditor],
  templateUrl: './user-content-panel.html',
})
export class UserContentPanel {
  private readonly layout = inject(HomeLayoutService);
  private readonly registry = inject(PanelRegistryService);
  private readonly externalLinks = inject(ExternalLinkService);
  private readonly resolver = inject(ShortcutResolverService);
  private readonly context = inject(PANEL_CONTEXT, { optional: true });

  private readonly instanceId = this.context?.instanceId ?? '';

  protected readonly kind = computed(() => {
    const instance = this.layout.layout().instances.find((i) => i.id === this.instanceId);
    return (instance && this.registry.resolveKind(instance.kindId)?.userContent) ?? 'text';
  });

  protected readonly content = computed<UserContent>(() => {
    const stored = this.layout.content()[this.instanceId];
    return stored && stored.kind === this.kind() ? stored : emptyUserContent(this.kind());
  });

  protected readonly title = computed(() => this.content().title || DEFAULT_TITLES[this.kind()]);
  protected readonly hasContent = computed(() => hasUserContent(this.content()));
  protected readonly editing = signal(false);
  protected readonly openError = signal<string | null>(null);

  protected readonly text = computed(() => (this.content().kind === 'text' ? (this.content() as Extract<UserContent, { kind: 'text' }>).text : ''));
  protected readonly links = computed(() => (this.content().kind === 'link' ? (this.content() as Extract<UserContent, { kind: 'link' }>).links : []));
  protected readonly shortcuts = computed(() =>
    (this.content().kind === 'shortcut' ? (this.content() as Extract<UserContent, { kind: 'shortcut' }>).targets : []).map((target) => ({
      target,
      info: this.resolver.resolve(target),
    })),
  );

  protected save(content: UserContent): void {
    this.layout.setContent(this.instanceId, content);
  }

  /** Desktop denies in-app window opens, so a click is routed through the narrow external-open bridge. */
  protected async onLinkClick(event: Event, url: string): Promise<void> {
    if (!this.externalLinks.isHandledNatively()) return;
    event.preventDefault();
    const result = await this.externalLinks.open(url);
    this.openError.set(result.ok ? null : result.error);
  }

  protected async runShortcut(target: ShortcutTarget): Promise<void> {
    const ran = await this.resolver.run(target);
    this.openError.set(ran ? null : 'That shortcut is no longer available.');
  }
}
