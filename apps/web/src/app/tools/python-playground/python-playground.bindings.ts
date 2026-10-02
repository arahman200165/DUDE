// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'python-playground';
export const binding = {
    load: () => import('./python-playground').then((m) => m.PythonPlayground)
};
