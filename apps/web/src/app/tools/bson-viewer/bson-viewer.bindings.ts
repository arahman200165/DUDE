// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'bson-viewer';
export const binding = {
    load: () => import('./bson-viewer').then((m) => m.BsonViewer)
};
