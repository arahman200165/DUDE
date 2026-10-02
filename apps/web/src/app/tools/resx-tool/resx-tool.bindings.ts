// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'resx-tool';
export const binding = {
    load: () => import('./resx-tool').then((m) => m.ResxTool)
};
