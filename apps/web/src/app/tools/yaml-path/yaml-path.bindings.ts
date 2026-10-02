// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'yaml-path';
export const binding = {
    load: () => import('./yaml-path').then((m) => m.YamlPath)
};
