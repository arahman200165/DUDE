// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'system-changes';
export const binding = {
    load: () => import('./system-changes').then((m) => m.SystemChangesTool),
    settingsLoad: () => import('./system-changes.settings').then((m) => m.SystemChangesSettings)
};
