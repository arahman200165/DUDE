// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'xml-xpath';
export const binding = {
    load: () => import('./xml-xpath').then((m) => m.XmlXpath)
};
