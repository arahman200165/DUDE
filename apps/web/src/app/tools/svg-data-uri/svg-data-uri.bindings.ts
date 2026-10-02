// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'svg-data-uri';
export const binding = {
    load: () => import('./svg-data-uri').then((m) => m.SvgDataUri)
};
