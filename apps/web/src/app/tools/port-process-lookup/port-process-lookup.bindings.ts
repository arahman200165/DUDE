// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'port-process-lookup';
export const binding = {
    load: () => import('./port-process-lookup').then((m) => m.PortProcessLookupTool)
};
