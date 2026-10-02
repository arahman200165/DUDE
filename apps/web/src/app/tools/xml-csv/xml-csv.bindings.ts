// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'xml-csv';
export const binding = {
    load: () => import('./xml-csv').then((m) => m.XmlCsv)
};
