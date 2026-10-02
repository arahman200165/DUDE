// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dev-snippets-reference';
export const binding = {
    load: () => import('./dev-snippets-reference').then((m) => m.DevSnippetsReference)
};
