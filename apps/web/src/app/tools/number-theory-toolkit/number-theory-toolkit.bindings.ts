// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'number-theory-toolkit';
export const binding = {
    load: () => import('./number-theory-toolkit').then((m) => m.NumberTheoryToolkit)
};
