// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'archive-tool';
export const binding = {
    load: () => import('./archive-tool').then((m) => m.ArchiveTool)
};
