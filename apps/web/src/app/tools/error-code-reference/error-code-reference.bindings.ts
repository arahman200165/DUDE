// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'error-code-reference';
export const binding = {
    load: () => import('./error-code-reference').then((m) => m.ErrorCodeReference)
};
