// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ct-lookup';
export const binding = {
    load: () => import('./ct-lookup').then((m) => m.CtLookupTool)
};
