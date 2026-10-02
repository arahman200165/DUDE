import { Type } from '@angular/core';

/**
 * One entry in the Settings sub-nav. Core sections are app-level and hand-listed here (Settings is a
 * shell destination, not a tool — see shell/AGENTS.md); tool-contributed sections come from the
 * registry (`ToolRegistryService.settingsSections()`) and render under a separate "Tools" group.
 * `keywords` feed the page's filter box and should include every setting label in the section.
 */
export interface CoreSettingsSection {
  readonly id: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly desktopOnly: boolean;
  readonly load: () => Promise<Type<unknown>>;
}

export const DEFAULT_SETTINGS_SECTION_ID = 'general';

export const CORE_SETTINGS_SECTIONS: readonly CoreSettingsSection[] = [
  {
    id: 'general',
    title: 'General',
    keywords: ['reopen tabs on restart', 'startup destination', 'setup wizard', 'onboarding', 'workspace', 'deck'],
    desktopOnly: false,
    load: () => import('./sections/general-settings').then((m) => m.GeneralSettings),
  },
  {
    id: 'appearance',
    title: 'Appearance',
    keywords: ['appearance', 'theme', 'light mode', 'dark mode', 'system theme', 'color scheme', 'colors', 'density', 'compact', 'comfortable', 'font', 'font size', 'text size', 'monospace', 'ligatures', 'motion', 'reduced motion', 'animation', 'export theme', 'import theme', 'theme file'],
    desktopOnly: false,
    load: () => import('./sections/appearance-settings').then((m) => m.AppearanceSettings),
  },
  {
    id: 'ai',
    title: 'AI / LLM Provider',
    keywords: ['llm', 'ai', 'openai', 'model', 'api key', 'base url', 'provider', 'secrets', 'regex'],
    desktopOnly: true,
    load: () => import('./sections/ai-provider-settings').then((m) => m.AiProviderSettings),
  },
  {
    id: 'hotkeys',
    title: 'Hotkeys',
    keywords: ['hotkey', 'shortcut', 'global', 'clipboard quick-actions', 'smart paste', 'quick launcher', 'keyboard'],
    desktopOnly: true,
    load: () => import('./sections/hotkeys-settings').then((m) => m.HotkeysSettings),
  },
  {
    id: 'window',
    title: 'Window & Updates',
    keywords: ['launch on login', 'tray', 'close to tray', 'minimized', 'window size', 'display', 'updates', 'notifications', 'collaborators'],
    desktopOnly: true,
    load: () => import('./sections/window-updates-settings').then((m) => m.WindowUpdatesSettings),
  },
  {
    id: 'files',
    title: 'Files',
    keywords: ['file associations', 'default apps', 'open with', 'native recents', 'recent files', 'explorer'],
    desktopOnly: true,
    load: () => import('./sections/files-settings').then((m) => m.FilesSettings),
  },
  {
    id: 'home-layout',
    title: 'Home layout',
    keywords: ['home', 'dashboard', 'panels', 'layout', 'arrange', 'customize', 'reorder', 'resize', 'hide', 'notes', 'links', 'shortcuts', 'reset to default'],
    desktopOnly: false,
    load: () => import('./sections/home-layout-settings').then((m) => m.HomeLayoutSettings),
  },
  {
    id: 'web-companion',
    title: 'Web & Offline',
    keywords: [
      'offline',
      'cache',
      'cache storage',
      'service worker',
      'pwa',
      'runtime',
      'pyodide',
      'wasm',
      'make available offline',
      'repair installation',
      'clear cached runtimes',
      'persistent storage',
      'capability matrix',
      'desktop-only',
      'install app',
      'install',
      'open in desktop',
      'desktop dude installed',
    ],
    desktopOnly: false,
    load: () => import('./sections/web-companion-settings').then((m) => m.WebCompanionSettings),
  },
  {
    id: 'device',
    title: 'This Device',
    keywords: ['device id', 'device name', 'installation id', 'environment id', 'enrollment', 'store', 'device store', 'outbox', 'recovery', 'quarantine', 'retry', 'reset', 'reset this device', 'clear data', 'schema version', 'backup'],
    desktopOnly: false,
    load: () => import('./sections/this-device-settings').then((m) => m.ThisDeviceSettings),
  },
  {
    id: 'data',
    title: 'Data & Privacy',
    keywords: ['clear all local data', 'reset', 'privacy', 'storage', 'delete', 'danger', 'export', 'import', 'bundle', 'backup', 'restore'],
    desktopOnly: false,
    load: () => import('./sections/data-privacy-settings').then((m) => m.DataPrivacySettings),
  },
];
