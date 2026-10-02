// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'yaml-json';
export const binding = {
    load: () => import('./yaml-json').then((m) => m.YamlJson)
};
