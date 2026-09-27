import { Component, computed, inject, signal } from '@angular/core';
import { ToolRegistryService } from '../../../core/registry/tool-registry.service';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { readStorageValue } from '../../../core/workspace/workspace-storage-bridge';
import type { WorkspaceOverridablePreference } from '../../../shared/models/tool-definition.model';

interface OverrideRow extends WorkspaceOverridablePreference {
  readonly toolId: string;
  readonly toolTitle: string;
  readonly globalValue: string;
}

/**
 * Workspace settings popover — one input per `settingsSection.workspaceOverridable` declaration in
 * the registry, so it names no tool itself (shell/AGENTS.md). Values are stored on the live layout
 * (`WorkspaceLayoutService.setPreferenceOverride`) and travel with saved templates/projects; an
 * empty field falls back to the tool's global value, shown as the placeholder.
 */
@Component({
  selector: 'app-workspace-overrides',
  templateUrl: './workspace-overrides.html',
})
export class WorkspaceOverrides {
  private readonly registry = inject(ToolRegistryService);
  protected readonly layout = inject(WorkspaceLayoutService);
  protected readonly open = signal(false);

  protected readonly rows = signal<readonly OverrideRow[]>(this.buildRows());

  protected readonly activeCount = computed(() => this.rows().filter((row) => this.valueOf(row) !== '').length);

  /** Global values are re-read on every open, so an edit made in Settings meanwhile shows up. */
  private buildRows(): readonly OverrideRow[] {
    return this.registry.settingsSections().flatMap((section) =>
      (section.workspaceOverridable ?? []).map((preference) => ({
        ...preference,
        toolId: section.toolId,
        toolTitle: section.toolTitle,
        globalValue: readStorageValue<string>(section.toolId, preference.key, 'local') ?? '',
      })),
    );
  }

  protected toggle(): void {
    if (!this.open()) this.rows.set(this.buildRows());
    this.open.set(!this.open());
  }

  protected valueOf(row: OverrideRow): string {
    return this.layout.preferenceOverrides()?.[row.toolId]?.[row.key] ?? '';
  }

  protected commit(row: OverrideRow, event: Event): void {
    this.layout.setPreferenceOverride(row.toolId, row.key, (event.target as HTMLInputElement).value);
  }

  protected clear(row: OverrideRow): void {
    this.layout.setPreferenceOverride(row.toolId, row.key, null);
  }
}
