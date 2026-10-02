// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'k8s-resource-calculator';
export const binding = {
    load: () => import('./k8s-resource-calculator').then((m) => m.K8sResourceCalculator)
};
