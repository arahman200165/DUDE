// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dnssec-inspector';
export const binding = {
    load: () => import('./dnssec-inspector').then((m) => m.DnssecInspectorTool)
};
