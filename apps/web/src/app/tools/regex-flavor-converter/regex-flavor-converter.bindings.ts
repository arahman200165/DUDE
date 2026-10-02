// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'regex-flavor-converter';
export const binding = {
    load: () => import('./regex-flavor-converter').then((m) => m.RegexFlavorConverter)
};
