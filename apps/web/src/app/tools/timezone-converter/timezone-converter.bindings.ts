// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'timezone-converter';
export const binding = {
    load: () => import('./timezone-converter').then((m) => m.TimezoneConverter)
};
