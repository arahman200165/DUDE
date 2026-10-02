// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'subnet-calculator';
export const binding = {
    load: () => import('./subnet-calculator').then((m) => m.SubnetCalculator)
};
