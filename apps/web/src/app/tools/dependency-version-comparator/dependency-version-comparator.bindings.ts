// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dependency-version-comparator';
export const binding = {
    load: () => import('./dependency-version-comparator').then((m) => m.DependencyVersionComparator)
};
