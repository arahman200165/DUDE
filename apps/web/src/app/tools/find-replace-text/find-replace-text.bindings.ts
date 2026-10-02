// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'find-replace-text';
export const binding = {
    load: () => import('./find-replace-text').then((m) => m.FindReplaceText)
};
