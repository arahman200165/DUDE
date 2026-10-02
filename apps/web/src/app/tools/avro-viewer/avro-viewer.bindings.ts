// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'avro-viewer';
export const binding = {
    load: () => import('./avro-viewer').then((m) => m.AvroViewer)
};
