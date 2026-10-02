// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'xml-xsd-validator';
export const binding = {
    load: () => import('./xml-xsd-validator').then((m) => m.XmlXsdValidator)
};
