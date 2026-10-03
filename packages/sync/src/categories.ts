/** User-facing sync categories. Each can be enabled or disabled per device. */
export const SYNC_CATEGORY_IDS = [
  'settings', 'favorites', 'pipelines', 'projects', 'workspaces', 'home', 'usage', 'workspace-layout', 'scratchpad',
] as const;

export type SyncCategory = (typeof SYNC_CATEGORY_IDS)[number];

export interface SyncCategoryDefinition {
  id: SyncCategory;
  label: string;
  description: string;
  defaultEnabled: boolean;
  sensitivity: 'non-sensitive' | 'sensitive';
}

export const SYNC_CATEGORIES: readonly SyncCategoryDefinition[] = [
  { id: 'settings', label: 'Settings', description: 'Appearance and tool preferences that apply to the whole environment.', defaultEnabled: true, sensitivity: 'non-sensitive' },
  { id: 'favorites', label: 'Favorites', description: 'Pinned and favorite tools.', defaultEnabled: true, sensitivity: 'non-sensitive' },
  { id: 'pipelines', label: 'Pipelines and scripts', description: 'Saved pipelines and user scripts. Syncing a definition never runs it.', defaultEnabled: true, sensitivity: 'non-sensitive' },
  { id: 'projects', label: 'Projects', description: 'Project definitions and activation history.', defaultEnabled: true, sensitivity: 'non-sensitive' },
  { id: 'workspaces', label: 'Workspace templates', description: 'Reusable workspace templates.', defaultEnabled: true, sensitivity: 'non-sensitive' },
  { id: 'home', label: 'Home layout', description: 'The designed Home screen layout.', defaultEnabled: true, sensitivity: 'non-sensitive' },
  { id: 'usage', label: 'Usage insights', description: 'Per-device usage counts and recent activity.', defaultEnabled: false, sensitivity: 'non-sensitive' },
  { id: 'workspace-layout', label: 'Workspace layout', description: 'Open tabs and panes; applied on the next launch.', defaultEnabled: false, sensitivity: 'non-sensitive' },
  { id: 'scratchpad', label: 'Scratchpad', description: 'Free-form scratchpad text. May contain sensitive content.', defaultEnabled: false, sensitivity: 'sensitive' },
];

export function defaultCategoryMap(): Record<SyncCategory, boolean> {
  const map = {} as Record<SyncCategory, boolean>;
  for (const c of SYNC_CATEGORIES) map[c.id] = c.defaultEnabled;
  return map;
}
