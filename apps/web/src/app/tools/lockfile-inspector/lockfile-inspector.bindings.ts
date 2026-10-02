// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'lockfile-inspector';
export const binding = {
    load: () => import('./lockfile-inspector').then((m) => m.LockfileInspector)
};
