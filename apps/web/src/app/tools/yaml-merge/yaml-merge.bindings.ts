// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'yaml-merge';
export const binding = {
    load: () => import('./yaml-merge').then((m) => m.YamlMerge)
};
