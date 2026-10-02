// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'k8s-quantity-converter';
export const binding = {
    load: () => import('./k8s-quantity-converter').then((m) => m.K8sQuantityConverter)
};
