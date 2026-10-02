// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'mock-data-studio';
export const binding = {
    load: () => import('./mock-data-studio').then((m) => m.MockDataStudio)
};
