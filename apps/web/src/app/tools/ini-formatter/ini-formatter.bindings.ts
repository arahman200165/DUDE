// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ini-formatter';
export const binding = {
    load: () => import('./ini-formatter').then((m) => m.IniFormatter)
};
