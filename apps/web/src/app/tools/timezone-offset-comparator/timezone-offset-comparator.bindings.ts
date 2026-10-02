// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'timezone-offset-comparator';
export const binding = {
    load: () => import('./timezone-offset-comparator').then((m) => m.TimezoneOffsetComparator)
};
