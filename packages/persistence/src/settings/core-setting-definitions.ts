import type { SettingDefinition } from './setting-definition.model.js';

/** Core (non-tool) settings. Later milestones append entries; tool keys use manifest `settingScopes`. */
export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  { key: 'settings:appearance', namespace: 'settings', name: 'appearance', scope: 'environment', sensitivity: 'non-sensitive', defaultValue: null, storage: 'kv', journal: true, owner: 'core', description: 'Theme, contrast, palette and density.' },
  { key: '__workspace__:reopenOnRestart', namespace: '__workspace__', name: 'reopenOnRestart', scope: 'environment', sensitivity: 'non-sensitive', defaultValue: false, storage: 'kv', journal: true, owner: 'core', description: 'Reopen the previous workspace tabs on restart.' },
  { key: 'settings.ai:baseUrl', namespace: 'settings.ai', name: 'baseUrl', scope: 'device', sensitivity: 'non-sensitive', defaultValue: '', storage: 'kv', journal: false, owner: 'settings.ai', description: 'AI provider base URL.' },
  { key: 'settings.ai:model', namespace: 'settings.ai', name: 'model', scope: 'device', sensitivity: 'non-sensitive', defaultValue: '', storage: 'kv', journal: false, owner: 'settings.ai', description: 'AI model name.' },
  { key: 'settings.ai:apiKey', namespace: 'settings.ai', name: 'apiKey', scope: 'device', sensitivity: 'secret', defaultValue: null, storage: 'secret', journal: false, owner: 'settings.ai', description: 'AI provider API key; stored as a SecretRef.' },
];

export function findSettingDefinition(namespace: string, key: string): SettingDefinition | undefined {
  return SETTING_DEFINITIONS.find(d => d.namespace === namespace && d.name === key);
}
