// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'scientific-notation-converter';
export const binding = {
    load: () => import('./scientific-notation-converter').then((m) => m.ScientificNotationConverter)
};
