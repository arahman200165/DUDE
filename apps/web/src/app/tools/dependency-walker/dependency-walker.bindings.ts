// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'dependency-walker';
export const binding = {
    load: () => import('./dependency-walker').then((module) => module.DependencyWalkerTool)
};
