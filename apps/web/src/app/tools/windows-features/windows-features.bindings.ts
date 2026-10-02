// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'windows-features';
export const binding = {
    load: () => import('./windows-features').then((m) => m.WindowsFeaturesTool)
};
