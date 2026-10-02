// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'numeric-representation-inspector';
export const binding = {
    load: () => import('./numeric-representation-inspector').then((m) => m.NumericRepresentationInspector)
};
