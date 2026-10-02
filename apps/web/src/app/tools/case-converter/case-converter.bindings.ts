// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'case-converter';
export const binding = {
    load: () => import('./case-converter').then((m) => m.CaseConverter)
};
