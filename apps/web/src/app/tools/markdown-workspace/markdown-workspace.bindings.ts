// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'markdown-workspace';
export const binding = {
    load: () => import('./markdown-workspace').then((m) => m.MarkdownWorkspace),
    settingsLoad: () => import('./markdown-workspace.settings').then((m) => m.MarkdownWorkspaceSettings)
};
