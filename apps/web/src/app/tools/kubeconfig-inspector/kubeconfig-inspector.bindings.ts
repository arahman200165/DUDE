// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'kubeconfig-inspector';
export const binding = {
    load: () => import('./kubeconfig-inspector').then((m) => m.KubeconfigInspector)
};
