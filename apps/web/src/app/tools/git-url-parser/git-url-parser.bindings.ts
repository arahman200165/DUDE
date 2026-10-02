// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'git-url-parser';
export const binding = {
    load: () => import('./git-url-parser').then((m) => m.GitUrlParser)
};
