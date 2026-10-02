// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'pixel-color-picker';
export const binding = {
    load: () => import('./pixel-color-picker').then((m) => m.PixelColorPicker)
};
