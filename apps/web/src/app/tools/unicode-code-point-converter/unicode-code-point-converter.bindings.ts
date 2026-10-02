// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'unicode-code-point-converter';
export const binding = {
    load: () => import('./unicode-code-point-converter').then((m) => m.UnicodeCodePointConverter)
};
