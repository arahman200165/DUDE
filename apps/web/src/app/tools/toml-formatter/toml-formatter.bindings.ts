// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'toml-formatter';
export const binding = {
    load: () => import('./toml-formatter').then((m) => m.TomlFormatter)
};
