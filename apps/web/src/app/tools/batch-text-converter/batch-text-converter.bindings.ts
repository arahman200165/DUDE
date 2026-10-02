// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'batch-text-converter';
export const binding = {
    load: () => import('./batch-text-converter').then((m) => m.BatchTextConverterTool)
};
