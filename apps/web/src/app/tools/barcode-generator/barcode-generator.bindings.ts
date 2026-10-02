// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'barcode-generator';
export const binding = {
    load: () => import('./barcode-generator').then((m) => m.BarcodeGenerator)
};
