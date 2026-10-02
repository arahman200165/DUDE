// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ksuid-tools';
export const binding = {
    load: () => import('./ksuid-tools').then((m) => m.KsuidTools)
};
