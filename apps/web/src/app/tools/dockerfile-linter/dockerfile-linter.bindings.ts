// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dockerfile-linter';
export const binding = {
    load: () => import('./dockerfile-linter').then((m) => m.DockerfileLinter)
};
