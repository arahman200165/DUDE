// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dns-propagation';
export const binding = {
    load: () => import('./dns-propagation').then((m) => m.DnsPropagationTool)
};
