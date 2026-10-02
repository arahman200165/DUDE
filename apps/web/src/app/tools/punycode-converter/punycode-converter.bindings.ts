// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'punycode-converter';
export const binding = {
    load: () => import('./punycode-converter').then((m) => m.PunycodeConverter)
};
