// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'css-transform-builder';
export const binding = {
    load: () => import('./css-transform-builder').then((m) => m.CssTransformBuilder)
};
