import { Component, ElementRef, Type, afterRenderEffect, computed, effect, inject, signal, viewChild } from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { map } from 'rxjs';
import { PlatformService } from '../../../core/platform/platform.service';
import { ContributedSettingsSection, ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { CORE_SETTINGS_SECTIONS, CoreSettingsSection, DEFAULT_SETTINGS_SECTION_ID } from '../settings-sections';

interface NavItem {
  readonly key: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly link: string;
  readonly keywords: readonly string[];
  readonly desktopOnly: boolean;
  readonly load: () => Promise<unknown>;
}

const toCoreItem = (section: CoreSettingsSection): NavItem => ({
  key: section.id,
  title: section.title,
  link: `/settings/${section.id}`,
  keywords: section.keywords,
  desktopOnly: section.desktopOnly,
  load: section.load,
});

const toToolItem = (section: ContributedSettingsSection): NavItem => ({
  key: `tools/${section.toolId}`,
  title: section.toolTitle,
  subtitle: section.title,
  link: `/settings/tools/${section.toolId}`,
  keywords: [section.title, ...(section.keywords ?? [])],
  desktopOnly: section.desktopOnly ?? false,
  load: section.load,
});

export function matchesSettingsFilter(item: Pick<NavItem, 'title' | 'subtitle' | 'keywords'>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [item.title, item.subtitle ?? '', ...item.keywords].some((text) => text.toLowerCase().includes(needle));
}

/**
 * The Settings shell destination (`/settings/:section`, `/settings/tools/:toolId`) — sanctioned
 * shell exception #8 (see shell/AGENTS.md). Core sections are hand-listed app-level panels; the
 * "Tools" group is generated from manifests' `settingsSection` declarations, so a tool adds its own
 * settings without touching this directory. On the web build desktop-only sections stay listed
 * (with a "Desktop" badge) but render an explainer instead of their controls.
 */
@Component({
  selector: 'app-settings-page',
  imports: [NgComponentOutlet, NgTemplateOutlet, RouterLink, RouterLinkActive],
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly registry = inject(ToolRegistryService);
  protected readonly platform = inject(PlatformService);

  protected readonly filter = signal('');
  protected readonly coreItems = CORE_SETTINGS_SECTIONS.map(toCoreItem);
  protected readonly toolItems = this.registry.settingsSections().map(toToolItem);

  protected readonly visibleCoreItems = computed(() => this.coreItems.filter((item) => matchesSettingsFilter(item, this.filter())));
  protected readonly visibleToolItems = computed(() => this.toolItems.filter((item) => matchesSettingsFilter(item, this.filter())));

  private readonly activeKey = toSignal(
    this.route.paramMap.pipe(
      map((params) => (params.has('toolId') ? `tools/${params.get('toolId')}` : (params.get('section') ?? DEFAULT_SETTINGS_SECTION_ID))),
    ),
    { initialValue: DEFAULT_SETTINGS_SECTION_ID },
  );

  protected readonly active = computed(() => [...this.coreItems, ...this.toolItems].find((item) => item.key === this.activeKey()));
  protected readonly unavailableHere = computed(() => (this.active()?.desktopOnly ?? false) && !this.platform.isDesktop());
  protected readonly component = signal<Type<unknown> | null>(null);

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');

  constructor() {
    // An unknown section id falls back to General rather than rendering an empty page.
    effect(() => {
      if (!this.active()) void this.router.navigate(['/settings', DEFAULT_SETTINGS_SECTION_ID], { replaceUrl: true });
    });

    effect(() => {
      const item = this.active();
      const unavailable = this.unavailableHere();
      this.component.set(null);
      if (!item || unavailable) return;
      void item.load().then((component) => {
        if (this.active() === item) this.component.set(component as Type<unknown>);
      });
    });

    // Highlight the rows in the open section whose text matches the filter.
    afterRenderEffect(() => {
      const needle = this.filter().trim().toLowerCase();
      this.component();
      const host = this.content()?.nativeElement;
      if (!host) return;
      for (const row of Array.from(host.querySelectorAll<HTMLElement>('[data-setting]'))) {
        const match = needle !== '' && (row.textContent ?? '').toLowerCase().includes(needle);
        row.classList.toggle('ring-1', match);
        row.classList.toggle('ring-accent', match);
        row.classList.toggle('rounded-sm', match);
      }
    });
  }

  protected isDimmed(item: NavItem): boolean {
    return item.desktopOnly && !this.platform.isDesktop();
  }

  protected onFilterInput(event: Event): void {
    this.filter.set((event.target as HTMLInputElement).value);
  }
}
