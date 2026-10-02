// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'k8s-manifest-validator';
export const binding = {
    load: () => import('./k8s-manifest-validator').then((m) => m.K8sManifestValidator)
};
