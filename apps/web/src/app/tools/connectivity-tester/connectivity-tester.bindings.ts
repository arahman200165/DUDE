// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'connectivity-tester';
export const binding = {
    load: () => import('./connectivity-tester').then((m) => m.ConnectivityTesterTool)
};
