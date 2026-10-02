// Angular-only loaders; metadata is owned by @dude/tool-registry.
export const bindingId = 'qr-code-generator';
export const binding = {
    load: () => import('./qr-code-generator').then((m) => m.QrCodeGenerator)
};
