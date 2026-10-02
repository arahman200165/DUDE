// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'flexbox-playground';
export const binding = {
    load: () => import('./flexbox-playground').then((m) => m.FlexboxPlayground)
};
