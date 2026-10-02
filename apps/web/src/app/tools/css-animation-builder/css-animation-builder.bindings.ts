// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'css-animation-builder';
export const binding = {
    load: () => import('./css-animation-builder').then((m) => m.CssAnimationBuilder)
};
