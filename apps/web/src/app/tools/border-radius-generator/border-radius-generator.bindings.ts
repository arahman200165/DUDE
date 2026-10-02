// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'border-radius-generator';
export const binding = {
    load: () => import('./border-radius-generator').then((m) => m.BorderRadiusGenerator)
};
