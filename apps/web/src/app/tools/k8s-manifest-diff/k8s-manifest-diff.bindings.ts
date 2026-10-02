// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'k8s-manifest-diff';
export const binding = {
    load: () => import('./k8s-manifest-diff').then((m) => m.K8sManifestDiff)
};
