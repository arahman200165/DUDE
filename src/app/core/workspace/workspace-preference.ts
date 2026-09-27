import { Signal, computed, inject } from '@angular/core';
import { WorkspaceLayoutService } from './workspace-layout.service';

export interface ResolvedPreference {
  readonly value: string;
  readonly source: 'workspace' | 'global';
}

/**
 * Resolves one of a tool's own string preferences against the live workspace's override for it
 * (set via `WorkspaceLayoutService.setPreferenceOverride`, carried by templates/projects), falling
 * back to `global` — the tool's normal `PersistenceService.signal(...)`. Generic by construction:
 * `core/` never knows which tool/key is being resolved; a tool opts a key in by declaring it in its
 * manifest's `settingsSection.workspaceOverridable`. Must be called in an injection context.
 */
export function resolvePreference(toolId: string, key: string, global: Signal<string>): Signal<ResolvedPreference> {
  const workspaceLayout = inject(WorkspaceLayoutService);
  return computed(() => {
    const override = workspaceLayout.preferenceOverrides()?.[toolId]?.[key];
    return override ? { value: override, source: 'workspace' } : { value: global(), source: 'global' };
  });
}
