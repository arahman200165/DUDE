// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'css-formatter';
export const binding = {
    load: () => import('./css-formatter').then((m) => m.CssFormatter)
};
