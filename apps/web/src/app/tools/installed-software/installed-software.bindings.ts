// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'installed-software';
export const binding = {
    load: () => import('./installed-software').then((m) => m.InstalledSoftwareTool)
};
