// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'color-converter';
export const binding = {
    load: () => import('./color-converter').then((m) => m.ColorConverter)
};
