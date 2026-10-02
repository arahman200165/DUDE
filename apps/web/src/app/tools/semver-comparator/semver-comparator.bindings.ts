// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'semver-comparator';
export const binding = {
    load: () => import('./semver-comparator').then((m) => m.SemverComparator)
};
