// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'structured-data-converter';
export const binding = {
    load: () => import('./structured-data-converter').then((m) => m.StructuredDataConverter)
};
