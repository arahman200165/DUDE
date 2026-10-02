// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'cidr-calculator';
export const binding = {
    load: () => import('./cidr-calculator').then((m) => m.CidrCalculator)
};
