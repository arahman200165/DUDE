// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'config-merge-tool';
export const binding = {
    load: () => import('./config-merge-tool').then((m) => m.ConfigMergeTool)
};
