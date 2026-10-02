// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'palette-generator';
export const binding = {
    load: () => import('./palette-generator').then((m) => m.PaletteGenerator)
};
