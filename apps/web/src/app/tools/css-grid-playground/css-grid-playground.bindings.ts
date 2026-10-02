// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'css-grid-playground';
export const binding = {
    load: () => import('./css-grid-playground').then((m) => m.CssGridPlayground)
};
