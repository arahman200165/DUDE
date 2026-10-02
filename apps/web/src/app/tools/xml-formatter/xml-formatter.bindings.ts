// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'xml-formatter';
export const binding = {
    load: () => import('./xml-formatter').then((m) => m.XmlFormatter)
};
