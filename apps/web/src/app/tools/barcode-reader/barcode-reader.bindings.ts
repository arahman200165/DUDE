// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'barcode-reader';
export const binding = {
    load: () => import('./barcode-reader').then((m) => m.BarcodeReader)
};
