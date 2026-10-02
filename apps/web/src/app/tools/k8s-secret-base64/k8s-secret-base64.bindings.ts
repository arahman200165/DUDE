// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'k8s-secret-base64';
export const binding = {
    load: () => import('./k8s-secret-base64').then((m) => m.K8sSecretBase64)
};
