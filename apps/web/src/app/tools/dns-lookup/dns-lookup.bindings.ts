// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dns-lookup';
export const binding = {
    load: () => import('./dns-lookup').then((m) => m.DnsLookupTool)
};
