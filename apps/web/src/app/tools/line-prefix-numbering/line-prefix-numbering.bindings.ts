// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'line-prefix-numbering';
export const binding = {
    load: () => import('./line-prefix-numbering').then((m) => m.LinePrefixNumbering)
};
