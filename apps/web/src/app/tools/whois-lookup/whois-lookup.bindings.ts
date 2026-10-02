// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'whois-lookup';
export const binding = {
    load: () => import('./whois-lookup').then((m) => m.WhoisLookupTool)
};
