// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'binary-structure-inspector';
export const binding = {
    load: () => import('./binary-structure-inspector').then((m) => m.BinaryStructureInspector)
};
