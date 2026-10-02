// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'line-order-tools';
export const binding = {
    load: () => import('./line-order-tools').then((m) => m.LineOrderTools)
};
