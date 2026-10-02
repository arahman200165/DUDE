// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'regex';
export const binding = {
    load: () => import('./regex').then((m) => m.Regex)
};
