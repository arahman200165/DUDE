// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'qr-code-scanner';
export const binding = {
    load: () => import('./qr-code-scanner').then((m) => m.QrCodeScanner)
};
