import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { ShortcutTarget, ShortcutTargetKind } from '../../../core/home-layout/user-content.model';
import { PlatformService } from '../../../core/platform/platform.service';
import { ToolLauncherService } from '../../../core/registry/tool-launcher.service';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { COMMAND_SOURCE, PaletteCommand } from '../../../shared/models/command-source.model';
import { SHELL_DESTINATIONS } from '../../navigation-command-source';
import { CORE_SETTINGS_SECTIONS } from '../../settings/settings-sections';

export interface ShortcutInfo {
  readonly title: string;
  readonly description: string;
  readonly available: boolean;
  /** Why it is unavailable (missing target or desktop-only); shown as the chip's tooltip. */
  readonly reason?: string;
}

export interface ShortcutOption {
  readonly ref: string;
  readonly title: string;
  readonly description: string;
}

/** Command kinds that can be pinned: `recent` entries are ephemeral, and tools have their own kind. */
const PINNABLE_COMMAND_KINDS: readonly PaletteCommand['kind'][] = ['navigation', 'pipeline', 'workspace', 'project', 'native', 'preference'];

/**
 * Resolves a shortcut panel's stored references to their authoritative owners: tools via the
 * registry, destinations via `SHELL_DESTINATIONS`, settings sections via the core list and the
 * registry's contributed sections, commands via the live `COMMAND_SOURCE` feed. It copies nothing
 * and **runs nothing on its own** — `run` is called only from a user's click, and commands keep
 * whatever confirmation their own `execute()` performs. A missing target resolves to an
 * unavailable chip rather than throwing.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutResolverService {
  private readonly registry = inject(ToolRegistryService);
  private readonly launcher = inject(ToolLauncherService);
  private readonly router = inject(Router);
  private readonly platform = inject(PlatformService);
  private readonly sources = inject(COMMAND_SOURCE, { optional: true }) ?? [];

  private readonly commandIndex = computed(() => new Map(this.sources.flatMap((s) => s.commands()).map((c) => [c.id, c])));

  resolve(target: ShortcutTarget): ShortcutInfo {
    switch (target.kind) {
      case 'tool': {
        const tool = this.registry.getById(target.ref);
        return tool ? this.ok(tool.title, tool.description) : this.missing('This tool is no longer available.');
      }
      case 'destination': {
        const dest = SHELL_DESTINATIONS.find((d) => d.id === target.ref);
        return dest ? this.ok(dest.title, 'App page') : this.missing('This page is no longer available.');
      }
      case 'settings': {
        const section = this.settingsSection(target.ref);
        if (!section) return this.missing('This settings section is no longer available.');
        return section.desktopOnly && !this.platform.isDesktop() ? this.desktopOnly(section.title) : this.ok(section.title, 'Settings');
      }
      case 'command': {
        const command = this.commandIndex().get(target.ref);
        if (!command) return this.missing('This action is no longer available.');
        return command.desktopOnly && !this.platform.isDesktop() ? this.desktopOnly(command.title) : this.ok(command.title, command.description ?? 'Action');
      }
    }
  }

  /** Explicit user action only. Resolves to false when the target is unavailable. */
  async run(target: ShortcutTarget): Promise<boolean> {
    if (!this.resolve(target).available) return false;
    switch (target.kind) {
      case 'tool': {
        const tool = this.registry.getById(target.ref);
        if (!tool) return false;
        this.launcher.open(tool);
        return true;
      }
      case 'destination': {
        const dest = SHELL_DESTINATIONS.find((d) => d.id === target.ref);
        if (!dest) return false;
        await this.router.navigateByUrl(dest.url);
        return true;
      }
      case 'settings': {
        await this.router.navigateByUrl(`/settings/${target.ref}`);
        return true;
      }
      case 'command': {
        const command = this.commandIndex().get(target.ref);
        if (!command) return false;
        await command.execute();
        return true;
      }
    }
  }

  /** Candidates for the editor's picker, filtered by a free-text query. */
  options(kind: ShortcutTargetKind, query: string, limit = 8): readonly ShortcutOption[] {
    const q = query.trim().toLowerCase();
    const all = this.allOptions(kind);
    const matches = q ? all.filter((o) => `${o.title} ${o.description} ${o.ref}`.toLowerCase().includes(q)) : all;
    return matches.slice(0, limit);
  }

  private allOptions(kind: ShortcutTargetKind): readonly ShortcutOption[] {
    switch (kind) {
      case 'tool':
        return this.registry.getAll().map((t) => ({ ref: t.id, title: t.title, description: t.description }));
      case 'destination':
        return SHELL_DESTINATIONS.map((d) => ({ ref: d.id, title: d.title, description: 'App page' }));
      case 'settings':
        return [
          ...CORE_SETTINGS_SECTIONS.filter((s) => !s.desktopOnly || this.platform.isDesktop()).map((s) => ({ ref: s.id, title: `Settings: ${s.title}`, description: 'Settings' })),
          ...this.registry.settingsSections().map((s) => ({ ref: `tools/${s.toolId}`, title: `Settings: ${s.toolTitle}`, description: 'Tool settings' })),
        ];
      case 'command':
        return [...this.commandIndex().values()]
          .filter((c) => PINNABLE_COMMAND_KINDS.includes(c.kind) && (!c.desktopOnly || this.platform.isDesktop()))
          .map((c) => ({ ref: c.id, title: c.title, description: c.description ?? c.kind }));
    }
  }

  private settingsSection(ref: string): { title: string; desktopOnly: boolean } | undefined {
    const core = CORE_SETTINGS_SECTIONS.find((s) => s.id === ref);
    if (core) return core;
    if (!ref.startsWith('tools/')) return undefined;
    const tool = this.registry.settingsSections().find((s) => s.toolId === ref.slice('tools/'.length));
    return tool && { title: tool.title, desktopOnly: tool.desktopOnly === true };
  }

  private ok(title: string, description: string): ShortcutInfo {
    return { title, description, available: true };
  }
  private missing(reason: string): ShortcutInfo {
    return { title: 'Unavailable shortcut', description: '', available: false, reason };
  }
  private desktopOnly(title: string): ShortcutInfo {
    return { title, description: '', available: false, reason: 'Needs the DUDE desktop app.' };
  }
}
