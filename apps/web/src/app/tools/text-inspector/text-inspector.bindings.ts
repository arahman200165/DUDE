// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'text-inspector';
export const binding = {
    load: () => import('./text-inspector').then((m) => m.TextInspector)
};
