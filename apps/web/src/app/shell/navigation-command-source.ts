import { Injectable, Provider, inject } from '@angular/core';
import { Router } from '@angular/router';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../shared/models/command-source.model';
import { ToolRegistryService } from '../core/registry/tool-registry.service';
import { PlatformService } from '../core/platform/platform.service';
import { CORE_SETTINGS_SECTIONS, settingsSectionAvailability } from './settings/settings-sections';

interface Destination {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly keywords: readonly string[];
}

/** The sanctioned shell destinations (shell/AGENTS.md) — fixed app routes, never tool ids. */
export const SHELL_DESTINATIONS: readonly Destination[] = [
  { id: 'home', title: 'Home', url: '/', keywords: ['deck', 'dashboard', 'start'] },
  { id: 'smart-paste', title: 'Smart Paste', url: '/smart-paste', keywords: ['paste', 'detect', 'clipboard'] },
  { id: 'workspace', title: 'Workspace', url: '/workspace', keywords: ['tabs', 'panels', 'split'] },
  { id: 'history', title: 'History', url: '/history', keywords: ['recent', 'recall'] },
  { id: 'browse-tools', title: 'Browse Tools', url: '/tools', keywords: ['browse', 'catalog', 'all tools', 'search tools'] },
  { id: 'pipelines', title: 'Pipelines', url: '/pipelines', keywords: ['chain', 'workflow', 'scripts'] },
  { id: 'quick-run', title: 'Quick Run', url: '/quick-run', keywords: ['run', 'transform'] },
  { id: 'projects', title: 'Projects', url: '/projects', keywords: ['bundle', 'layout'] },
  { id: 'insights', title: 'Insights', url: '/insights', keywords: ['usage', 'activity', 'stats', 'trend', 'top tools'] },
  { id: 'settings', title: 'Settings', url: '/settings', keywords: ['preferences', 'options', 'config'] },
];

/**
 * Command Palette "Go to" source — one command per shell destination plus one per Settings section
 * (core sections and every registry-contributed `settingsSection`), so every non-tool surface is
 * reachable from Ctrl+K. Lives in shell/ because it names shell routes; tool-contributed sections
 * are resolved through the registry, never by id.
 */
@Injectable()
export class NavigationCommandSource implements CommandSource {
  private readonly router = inject(Router);
  private readonly registry = inject(ToolRegistryService);
  private readonly platform = inject(PlatformService);

  commands(): readonly PaletteCommand[] {
    const go = (url: string) => () => void this.router.navigateByUrl(url);

    const destinations: PaletteCommand[] = SHELL_DESTINATIONS.map((destination) => ({
      id: `navigation:${destination.id}`,
      kind: 'navigation',
      title: destination.title,
      keywords: destination.keywords,
      execute: go(destination.url),
    }));

    const host = this.platform.hostKind;
    const coreSections: PaletteCommand[] = CORE_SETTINGS_SECTIONS.filter((section) => settingsSectionAvailability(section.hosts, host) !== 'hidden').map((section) => ({
      id: `navigation:settings:${section.id}`,
      kind: 'navigation',
      title: `Settings: ${section.title}`,
      keywords: section.keywords,
      desktopOnly: settingsSectionAvailability(section.hosts, host) === 'desktop-only',
      execute: go(`/settings/${section.id}`),
    }));

    const toolSections: PaletteCommand[] = this.registry.settingsSections().map((section) => ({
      id: `navigation:settings:tools:${section.toolId}`,
      kind: 'navigation',
      title: `Settings: ${section.toolTitle} — ${section.title}`,
      keywords: section.keywords ?? [],
      desktopOnly: section.desktopOnly ?? false,
      execute: go(`/settings/tools/${section.toolId}`),
    }));

    return [...destinations, ...coreSections, ...toolSections];
  }
}

export const NAVIGATION_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  NavigationCommandSource,
  { provide: COMMAND_SOURCE, useExisting: NavigationCommandSource, multi: true },
];
