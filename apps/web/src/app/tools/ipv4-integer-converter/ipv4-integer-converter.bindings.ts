// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'ipv4-integer-converter';
export const binding = {
    load: () => import('./ipv4-integer-converter').then((m) => m.Ipv4IntegerConverter)
};
