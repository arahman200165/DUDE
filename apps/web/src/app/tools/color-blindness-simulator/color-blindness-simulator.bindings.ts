// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'color-blindness-simulator';
export const binding = {
    load: () => import('./color-blindness-simulator').then((m) => m.ColorBlindnessSimulator)
};
