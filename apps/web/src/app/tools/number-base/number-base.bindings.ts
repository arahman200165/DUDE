// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'number-base';
export const binding = {
    load: () => import('./number-base').then((m) => m.NumberBase)
};
