// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ascii-art-generator';
export const binding = {
    load: () => import('./ascii-art-generator').then((m) => m.AsciiArtGenerator)
};
