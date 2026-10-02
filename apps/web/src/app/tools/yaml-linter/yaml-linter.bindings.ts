// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'yaml-linter';
export const binding = {
    load: () => import('./yaml-linter').then((m) => m.YamlLinter)
};
