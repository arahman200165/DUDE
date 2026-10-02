// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'yaml-anchors';
export const binding = {
    load: () => import('./yaml-anchors').then((m) => m.YamlAnchors)
};
