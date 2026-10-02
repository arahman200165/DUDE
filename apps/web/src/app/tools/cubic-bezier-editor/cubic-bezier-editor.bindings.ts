// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'cubic-bezier-editor';
export const binding = {
    load: () => import('./cubic-bezier-editor').then((m) => m.CubicBezierEditor)
};
