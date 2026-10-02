// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'compression-lab';
export const binding = {
    load: () => import('./compression-lab').then((m) => m.CompressionLab)
};
