// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'markdown';
export const binding = {
    load: () => import('./markdown').then((m) => m.Markdown)
};
