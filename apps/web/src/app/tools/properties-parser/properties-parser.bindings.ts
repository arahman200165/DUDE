// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'properties-parser';
export const binding = {
    load: () => import('./properties-parser').then((m) => m.PropertiesParser)
};
